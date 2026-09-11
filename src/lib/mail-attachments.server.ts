/**
 * Mail Center — inbound attachment worker.
 *
 * Mailgun "store and notify" routes hand us a URL instead of the bytes, so the
 * webhook records the metadata as `pending` and queues an `email_jobs` row.
 * This worker drains that queue: download from Mailgun (and only Mailgun),
 * re-validate with the SAME rules as the webhook, upload into the private
 * bucket, then flip the attachment to `stored`, `rejected` or `failed`.
 *
 * Idempotent and retry-safe by construction:
 *  - jobs are claimed atomically (`email_jobs_claim`, SKIP LOCKED + lock TTL);
 *  - the storage path is derived from ids only (`<message>/<attachment>`) and
 *    uploaded with upsert, so a retry overwrites instead of duplicating;
 *  - an attachment already `stored` short-circuits the job to done;
 *  - `email_job_finish` applies exponential backoff and parks a job as `dead`
 *    once `max_attempts` is exhausted.
 */
import { MAX_ATTACHMENT_BYTES, safeLogFields, validateAttachment } from "@/lib/mailgun";
import { fetchMailgunAttachment } from "@/lib/mailgun.server";

const ATTACHMENT_BUCKET = "mail-attachments";
const JOB_KIND = "inbound_attachments";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export type AttachmentWorkerResult = {
  claimed: number;
  stored: number;
  rejected: number;
  failed: number;
};

type ClaimedJob = {
  id: string;
  message_id: string | null;
  payload: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
};

/** Processes one claimed job. Never throws: the outcome drives the job state. */
async function processJob(db: Db, job: ClaimedJob): Promise<"stored" | "rejected" | "failed"> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const attachmentId =
    typeof payload["attachment_id"] === "string" ? payload["attachment_id"] : null;
  const url = typeof payload["url"] === "string" ? payload["url"] : null;
  if (!attachmentId || !url) return "failed";

  const { data: attachment } = await db
    .from("email_attachments")
    .select("id, message_id, filename, content_type, size_bytes, status, storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!attachment) return "failed";

  // Already settled by a previous (possibly concurrent) attempt.
  if (attachment.status === "stored" && attachment.storage_path) return "stored";
  if (attachment.status === "rejected") return "rejected";

  const check = validateAttachment({
    filename: attachment.filename,
    contentType: attachment.content_type,
    size: attachment.size_bytes,
  });
  if (!check.ok) {
    await db
      .from("email_attachments")
      .update({ status: "rejected", rejected_reason: check.reason })
      .eq("id", attachment.id);
    return "rejected";
  }

  const download = await fetchMailgunAttachment(url, MAX_ATTACHMENT_BYTES);
  if (!download.ok) {
    if (download.error === "size_exceeded") {
      await db
        .from("email_attachments")
        .update({ status: "rejected", rejected_reason: "size_exceeded" })
        .eq("id", attachment.id);
      return "rejected";
    }
    return "failed";
  }

  // The declared content type can lie; the downloaded one is re-checked too.
  const actual = validateAttachment({
    filename: attachment.filename,
    contentType: download.contentType,
    size: download.data.byteLength,
  });
  if (!actual.ok) {
    await db
      .from("email_attachments")
      .update({ status: "rejected", rejected_reason: actual.reason })
      .eq("id", attachment.id);
    return "rejected";
  }

  const path = `${attachment.message_id}/${attachment.id}`;
  const upload = await db.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, download.data, { contentType: download.contentType, upsert: true });
  if (upload.error) return "failed";

  await db
    .from("email_attachments")
    .update({
      status: "stored",
      storage_path: path,
      size_bytes: download.data.byteLength,
      rejected_reason: null,
    })
    .eq("id", attachment.id);
  return "stored";
}

/**
 * Drains up to `limit` queued attachment jobs. Safe to call repeatedly and
 * concurrently — the claim is atomic, so two runners never take the same job.
 */
export async function runInboundAttachmentJobs(
  db: Db,
  limit = 10,
): Promise<AttachmentWorkerResult> {
  const result: AttachmentWorkerResult = { claimed: 0, stored: 0, rejected: 0, failed: 0 };

  const { data, error } = await db.rpc("email_jobs_claim", {
    _kind: JOB_KIND,
    _limit: Math.max(1, Math.min(limit, 25)),
  } as never);
  if (error) {
    console.error("[mail:jobs] claim failed", safeLogFields({ code: error.code ?? null }));
    return result;
  }

  const jobs = (data ?? []) as unknown as ClaimedJob[];
  result.claimed = jobs.length;

  for (const job of jobs) {
    let outcome: "stored" | "rejected" | "failed" = "failed";
    try {
      outcome = await processJob(db, job);
    } catch (e) {
      // Filenames and addresses are personal data: only the reason is logged.
      console.error(
        "[mail:jobs] processing error",
        safeLogFields({ message: (e as Error).message }),
      );
    }

    result[outcome] += 1;
    await db.rpc("email_job_finish", {
      _job_id: job.id,
      _ok: outcome !== "failed",
      _error: outcome === "failed" ? "attachment_processing_failed" : null,
    } as never);
  }

  if (result.claimed) {
    console.info(
      "[mail:jobs] processed",
      safeLogFields({ metric: "mail_attachment_jobs", ...result }),
    );
  }
  return result;
}
