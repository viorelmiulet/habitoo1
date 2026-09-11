/**
 * Mail Center — outbound attachments.
 *
 * A ServerFn cannot carry a `File`/`Blob`, so the browser uploads each file on
 * its own (base64 body) BEFORE composing: the bytes land in the SAME private
 * bucket used by inbound mail, under a staging prefix, and the caller only ever
 * receives an opaque upload id. `sendMailboxMessage` / `replyToThread` then
 * take `attachmentIds`, re-check ownership, re-validate the bytes and only then
 * hand them to Mailgun.
 *
 * Invariants:
 *  - validation is re-run server side (MIME allowlist, 10 MB/file, 25 MB total,
 *    20 files, sanitized filename, no executables, no active HTML/SVG);
 *  - storage paths are derived from ids only — a filename never reaches a path;
 *  - an `email_attachments` row is created only once its message exists, so no
 *    orphan metadata; a failed send leaves the staging file reusable instead;
 *  - staged files expire and are purged, so nothing lingers in the bucket.
 */
import {
  MAX_ATTACHMENT_BYTES,
  attachmentReasonMessage,
  safeLogFields,
  sanitizeFilename,
  validateAttachment,
  validateAttachmentSet,
} from "@/lib/mailgun";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const ATTACHMENT_BUCKET = "mail-attachments";
const STAGING_PREFIX = "outbox";

export type StagedUpload = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
};

export type LoadedAttachment = StagedUpload & {
  data: Uint8Array;
  storagePath: string;
};

export function stagingPath(uploadId: string): string {
  return `${STAGING_PREFIX}/${uploadId}`;
}

/** Base64 -> bytes, bounded so a huge payload cannot be materialised twice. */
function decodeBase64(value: string): Uint8Array | null {
  const cleaned = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  if (!/^[A-Za-z0-9+/=\s]*$/.test(cleaned)) return null;
  try {
    const buf = Buffer.from(cleaned, "base64");
    return buf.byteLength ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}

/** Drops staged files nobody consumed. Cheap enough to run on every upload. */
export async function purgeExpiredUploads(db: Db): Promise<number> {
  const { data } = await db
    .from("mail_outbound_uploads")
    .select("id, storage_path")
    .is("consumed_at", null)
    .lt("expires_at", new Date().toISOString())
    .limit(50);

  const rows = data ?? [];
  if (!rows.length) return 0;

  await db.storage.from(ATTACHMENT_BUCKET).remove(rows.map((r) => r.storage_path));
  await db
    .from("mail_outbound_uploads")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    );
  return rows.length;
}

/**
 * Stores one outbound file in the private bucket and returns its upload id.
 * The declared metadata is never trusted: the decoded byte length and the
 * sanitized filename are what get validated and persisted.
 */
export async function stageOutboundAttachment(
  db: Db,
  actorId: string,
  input: { filename: string; contentType: string; dataBase64: string },
): Promise<{ upload: StagedUpload | null; error: string | null }> {
  const bytes = decodeBase64(input.dataBase64);
  if (!bytes) return { upload: null, error: "Fișierul nu a putut fi citit." };
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return { upload: null, error: attachmentReasonMessage("size_exceeded") };
  }

  const filename = sanitizeFilename(input.filename);
  const contentType = (input.contentType || "").split(";")[0]!.trim().toLowerCase();
  const check = validateAttachment({ filename, contentType, size: bytes.byteLength });
  if (!check.ok) return { upload: null, error: attachmentReasonMessage(check.reason) };

  await purgeExpiredUploads(db);

  const { data: row, error } = await db
    .from("mail_outbound_uploads")
    .insert({
      created_by: actorId,
      filename: check.filename,
      content_type: contentType,
      size_bytes: bytes.byteLength,
      storage_path: "pending",
    })
    .select("id")
    .single();

  if (error || !row) {
    console.error(
      "[mail:outbound] stage insert failed",
      safeLogFields({ code: error?.code ?? null }),
    );
    return { upload: null, error: "Fișierul nu a putut fi încărcat." };
  }

  const path = stagingPath(row.id);
  const upload = await db.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });

  if (upload.error) {
    await db.from("mail_outbound_uploads").delete().eq("id", row.id);
    console.error(
      "[mail:outbound] stage upload failed",
      safeLogFields({ metric: "mail_upload_failed" }),
    );
    return { upload: null, error: "Fișierul nu a putut fi încărcat." };
  }

  await db.from("mail_outbound_uploads").update({ storage_path: path }).eq("id", row.id);

  return {
    upload: { id: row.id, filename: check.filename, contentType, size: bytes.byteLength },
    error: null,
  };
}

/**
 * Resolves attachment ids to bytes. Ownership is enforced here — an id that
 * belongs to another administrator, is already consumed or has expired simply
 * does not resolve, so a guessed id cannot be attached to an email.
 */
export async function loadStagedAttachments(
  db: Db,
  actorId: string,
  ids: string[],
): Promise<{ ok: true; items: LoadedAttachment[] } | { ok: false; error: string }> {
  const unique = Array.from(new Set(ids));
  if (!unique.length) return { ok: true, items: [] };

  const { data } = await db
    .from("mail_outbound_uploads")
    .select("id, filename, content_type, size_bytes, storage_path, consumed_at, expires_at")
    .in("id", unique)
    .eq("created_by", actorId)
    .is("consumed_at", null);

  const rows = data ?? [];
  if (rows.length !== unique.length) return { ok: false, error: "Atașament indisponibil." };

  const now = Date.now();
  const items: LoadedAttachment[] = [];
  for (const row of rows) {
    if (row.expires_at && Date.parse(row.expires_at) < now) {
      return { ok: false, error: "Atașament indisponibil." };
    }
    if (row.storage_path !== stagingPath(row.id))
      return { ok: false, error: "Atașament indisponibil." };

    const { data: blob, error } = await db.storage
      .from(ATTACHMENT_BUCKET)
      .download(row.storage_path);
    if (error || !blob) return { ok: false, error: "Atașament indisponibil." };

    const bytes = new Uint8Array(await blob.arrayBuffer());
    items.push({
      id: row.id,
      filename: row.filename,
      contentType: row.content_type,
      size: bytes.byteLength,
      data: bytes,
      storagePath: row.storage_path,
    });
  }

  // Final authority: the same rules the inbound path applies, on real bytes.
  const check = validateAttachmentSet(
    items.map((i) => ({ filename: i.filename, contentType: i.contentType, size: i.size })),
  );
  if (!check.ok) return { ok: false, error: check.error };

  return { ok: true, items };
}

/**
 * Attaches the staged files to a message that now exists. The object is moved
 * from the staging prefix to the canonical `<messageId>/<attachmentId>` path —
 * the same shape the inbound worker writes and the only one the signed-URL
 * issuer accepts.
 */
export async function persistOutboundAttachments(
  db: Db,
  messageId: string,
  items: LoadedAttachment[],
): Promise<{ stored: number }> {
  let stored = 0;

  for (const item of items) {
    const { data: row, error } = await db
      .from("email_attachments")
      .insert({
        message_id: messageId,
        filename: item.filename,
        content_type: item.contentType,
        size_bytes: item.size,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !row) {
      console.error(
        "[mail:outbound] attachment insert failed",
        safeLogFields({ code: error?.code ?? null }),
      );
      continue;
    }

    const finalPath = `${messageId}/${row.id}`;
    const moved = await db.storage.from(ATTACHMENT_BUCKET).move(item.storagePath, finalPath);
    if (moved.error) {
      // No orphan metadata: the row goes away if its bytes did not follow.
      await db.from("email_attachments").delete().eq("id", row.id);
      console.error(
        "[mail:outbound] attachment move failed",
        safeLogFields({ metric: "mail_attachment_move_failed" }),
      );
      continue;
    }

    await db
      .from("email_attachments")
      .update({ status: "stored", storage_path: finalPath, rejected_reason: null })
      .eq("id", row.id);

    await db
      .from("mail_outbound_uploads")
      .update({ consumed_at: new Date().toISOString(), storage_path: finalPath })
      .eq("id", item.id);

    stored += 1;
  }

  if (stored) {
    await db.from("email_messages").update({ has_attachments: true }).eq("id", messageId);
  }
  return { stored };
}
