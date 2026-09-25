/**
 * Mail Center — Trash (Coș): move to trash, restore, permanent delete.
 *
 * Callers are authorized as superadmin BEFORE these run (they receive the
 * service-role client). The database functions are executable by
 * `service_role` only, and `email_threads_purge` itself refuses any thread
 * that is not in `trash`, so the rule holds even if a caller forgets it.
 *
 * Permanent delete is all-or-nothing across Storage and the database:
 *   1. every attachment file is MOVED to a quarantine prefix (reversible);
 *   2. the database rows are deleted in ONE transaction (`email_threads_purge`,
 *      which also writes `audit_logs` — subject and counts only, no content);
 *   3. only then are the quarantined files removed.
 * A failure in step 1 or 2 moves every file back and nothing is deleted.
 */
type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const ATTACHMENT_BUCKET = "mail-attachments";
const QUARANTINE_PREFIX = "purge-quarantine";
export const PURGE_MAX_THREADS = 200;

export type TrashResult = { ok: boolean; count: number; error: string | null };

export async function trashThreads(db: Db, threadIds: string[]): Promise<TrashResult> {
  const { data, error } = await db.rpc("email_threads_trash", { _thread_ids: threadIds } as never);
  if (error) {
    console.error("[mail:trash] move failed", { code: (error as { code?: string }).code });
    return { ok: false, count: 0, error: "Conversațiile nu au putut fi mutate în Coș." };
  }
  return { ok: true, count: Number(data ?? 0), error: null };
}

export async function restoreThreads(db: Db, threadIds: string[]): Promise<TrashResult> {
  const { data, error } = await db.rpc("email_threads_restore", {
    _thread_ids: threadIds,
  } as never);
  if (error) {
    console.error("[mail:trash] restore failed", { code: (error as { code?: string }).code });
    return { ok: false, count: 0, error: "Conversațiile nu au putut fi restaurate." };
  }
  return { ok: true, count: Number(data ?? 0), error: null };
}

type ThreadRow = { id: string; status: string; message_count: number | null };

async function loadThreads(db: Db, threadIds: string[]) {
  const { data, error } = await db
    .from("email_threads")
    .select("id, status, message_count")
    .in("id", threadIds);
  if (error) return null;
  return (data ?? []) as ThreadRow[];
}

/** Ids of every conversation currently in trash (optionally one mailbox). */
export async function trashedThreadIds(db: Db, mailboxId: string | null): Promise<string[]> {
  let query = db.from("email_threads").select("id").eq("status", "trash");
  if (mailboxId) query = query.eq("mailbox_id", mailboxId);
  const { data } = await query.limit(PURGE_MAX_THREADS);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export type PurgePreview = {
  ok: boolean;
  threads: number;
  messages: number;
  threadIds: string[];
  error: string | null;
};

/** Counts shown in the confirmation dialog. Refuses anything not in trash. */
export async function previewPurge(db: Db, threadIds: string[]): Promise<PurgePreview> {
  const empty = { threads: 0, messages: 0, threadIds: [] as string[] };
  if (!threadIds.length) return { ok: false, ...empty, error: "Nicio conversație selectată." };
  const rows = await loadThreads(db, threadIds);
  if (!rows) return { ok: false, ...empty, error: "Conversațiile nu au putut fi citite." };
  if (rows.length !== new Set(threadIds).size) {
    return { ok: false, ...empty, error: "Una dintre conversații nu există." };
  }
  if (rows.some((r) => r.status !== "trash")) {
    return { ok: false, ...empty, error: "Doar conversațiile din Coș pot fi șterse definitiv." };
  }
  const { count } = await db
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", threadIds);
  return {
    ok: true,
    threads: rows.length,
    messages: count ?? rows.reduce((s, r) => s + (r.message_count ?? 0), 0),
    threadIds: rows.map((r) => r.id),
    error: null,
  };
}

export type PurgeResult = {
  ok: boolean;
  threads: number;
  messages: number;
  attachments: number;
  error: string | null;
};

async function attachmentPaths(db: Db, threadIds: string[]): Promise<string[] | null> {
  const { data: messages, error } = await db
    .from("email_messages")
    .select("id")
    .in("thread_id", threadIds);
  if (error) return null;
  const ids = ((messages ?? []) as { id: string }[]).map((m) => m.id);
  if (!ids.length) return [];
  const { data: rows, error: attError } = await db
    .from("email_attachments")
    .select("storage_path")
    .in("message_id", ids);
  if (attError) return null;
  return ((rows ?? []) as { storage_path: string | null }[])
    .map((r) => r.storage_path)
    .filter((p): p is string => !!p);
}

export async function purgeThreads(
  db: Db,
  threadIds: string[],
  actorId: string,
): Promise<PurgeResult> {
  const fail = (error: string): PurgeResult => ({
    ok: false,
    threads: 0,
    messages: 0,
    attachments: 0,
    error,
  });

  const preview = await previewPurge(db, threadIds);
  if (!preview.ok) return fail(preview.error ?? "Ștergerea a fost refuzată.");

  const paths = await attachmentPaths(db, threadIds);
  if (!paths) return fail("Atașamentele nu au putut fi citite. Nimic nu a fost șters.");

  const bucket = db.storage.from(ATTACHMENT_BUCKET);
  const runId = crypto.randomUUID();
  const moved: { from: string; to: string }[] = [];
  const rollback = async () => {
    for (const m of moved) {
      const { error } = await bucket.move(m.to, m.from);
      if (error) console.error("[mail:purge] rollback move failed", { path: m.from });
    }
  };

  // 1. Quarantine every file; any failure puts everything back.
  for (const path of paths) {
    const to = `${QUARANTINE_PREFIX}/${runId}/${path}`;
    const { error } = await bucket.move(path, to);
    if (error) {
      console.error("[mail:purge] quarantine failed", { path });
      await rollback();
      return fail("Atașamentele nu au putut fi șterse din stocare. Nimic nu a fost șters.");
    }
    moved.push({ from: path, to });
  }

  // 2. One database transaction; it re-checks `trash` and writes the audit.
  const { data, error } = await db.rpc("email_threads_purge", {
    _thread_ids: threadIds,
    _actor: actorId,
  } as never);
  if (error) {
    const message = String((error as { message?: string }).message ?? "");
    console.error("[mail:purge] database purge failed", { message });
    await rollback();
    if (message.includes("thread_not_in_trash")) {
      return fail("Doar conversațiile din Coș pot fi șterse definitiv. Nimic nu a fost șters.");
    }
    return fail("Conversațiile nu au putut fi șterse. Nimic nu a fost șters.");
  }

  const result = (data ?? {}) as { threads?: number; messages?: number; paths?: string[] };

  // 3. Remove the quarantined files, plus any attachment that arrived meanwhile.
  const late = (result.paths ?? []).filter((p) => !paths.includes(p));
  const toRemove = [...moved.map((m) => m.to), ...late];
  if (toRemove.length) {
    const { error: removeError } = await bucket.remove(toRemove);
    if (removeError) {
      // Rows are already gone; the files sit under the quarantine prefix only.
      console.error("[mail:purge] final remove failed", { runId, count: toRemove.length });
    }
  }

  return {
    ok: true,
    threads: Number(result.threads ?? preview.threads),
    messages: Number(result.messages ?? preview.messages),
    attachments: toRemove.length,
    error: null,
  };
}
