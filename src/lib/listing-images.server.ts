// Worker pentru coada `listing_image_jobs`: câte 6 poze în paralel, 8 s pe poză,
// cel mult 2 încercări. La eșec definitiv anunțul păstrează URL-ul original.
import {
  LISTING_IMAGE_CONCURRENCY,
  LISTING_IMAGE_MAX_BYTES,
  LISTING_IMAGE_TIMEOUT_MS,
  imageExtension,
  safeStorageId,
  statusAfterFailure,
} from "./listing-images";

export const LISTING_IMAGES_BUCKET = "listing-images";
const RUN_BUDGET_MS = 20_000;
const LEASE_SECONDS = 30;

type Job = { id: string; listing_id: string; source_url: string; position: number; attempts: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function download(url: string, fetchImpl: typeof fetch): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Adresă invalidă.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LISTING_IMAGE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "image/*" } });
    if (!response.ok) throw new Error(`Serverul a răspuns ${response.status}.`);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!contentType.toLowerCase().startsWith("image/")) throw new Error("Nu este o imagine.");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > LISTING_IMAGE_MAX_BYTES) throw new Error("Dimensiune neacceptată.");
    return { bytes, contentType };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Timp depășit (8 s).");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function processListingImageJob(admin: Admin, job: Job, baseUrl: string, fetchImpl: typeof fetch): Promise<"done" | "pending" | "failed"> {
  try {
    const { data: listing } = await admin.from("listings").select("external_id").eq("id", job.listing_id).maybeSingle();
    if (!listing) throw new Error("Anunțul nu mai există.");
    const { bytes, contentType } = await download(job.source_url, fetchImpl);
    const path = `${safeStorageId(String(listing.external_id))}/${job.position}-${crypto.randomUUID()}.${imageExtension(contentType, job.source_url)}`;
    const { error } = await admin.storage.from(LISTING_IMAGES_BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) throw new Error(`Încărcare eșuată: ${error.message}`);
    const stored = `${baseUrl}/api/public/listings/media/${crypto.randomUUID()}?p=${encodeURIComponent(path)}`;
    const { error: replaceError } = await admin.rpc("listing_image_replace", { _job_id: job.id, _stored_url: stored });
    if (replaceError) throw new Error(`Salvare eșuată: ${replaceError.message}`);
    return "done";
  } catch (error) {
    const status = statusAfterFailure(job.attempts);
    await admin.from("listing_image_jobs")
      .update({ status, last_error: (error instanceof Error ? error.message : "Eroare").slice(0, 500), locked_until: null, updated_at: new Date().toISOString() })
      .eq("id", job.id);
    return status;
  }
}

export async function runListingImages(options: { admin?: Admin; fetchImpl?: typeof fetch; baseUrl?: string; budgetMs?: number } = {}) {
  const admin = options.admin ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const baseUrl = options.baseUrl ?? (await import("@/lib/host")).CRM_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadline = Date.now() + (options.budgetMs ?? RUN_BUDGET_MS);
  const totals = { done: 0, pending: 0, failed: 0 };
  while (Date.now() < deadline) {
    const { data, error } = await admin.rpc("claim_listing_image_jobs", { _batch_size: LISTING_IMAGE_CONCURRENCY, _lease_seconds: LEASE_SECONDS });
    if (error) throw new Error(error.message);
    const jobs = (data ?? []) as Job[];
    if (jobs.length === 0) break;
    const results = await Promise.all(jobs.map((job) => processListingImageJob(admin, job, baseUrl, fetchImpl)));
    for (const r of results) totals[r] += 1;
  }
  return totals;
}
