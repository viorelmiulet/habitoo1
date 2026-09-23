/**
 * Worker pentru coada `property_import_images`: descarcă pozele externe
 * (doar gazde permise), le urcă neprelucrate în `property-media` și creează
 * rândul în `property_images`. Fără watermark (se aplică la publicare).
 */
import { MEDIA_BUCKET, mediaPath } from "@/lib/storage";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_ATTEMPTS = 3;
export const BATCH_SIZE = 8;
export const RUN_BUDGET_MS = 20_000;
const LEASE_SECONDS = 60;
const MAX_REDIRECTS = 3;

export class ImageFetchError extends Error {}

/** Doar https și gazde `immoflux.ro` / `*.immoflux.ro`. */
export function assertAllowedImageUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageFetchError("Adresă de poză invalidă.");
  }
  if (url.protocol !== "https:") throw new ImageFetchError("Doar adrese https sunt acceptate.");
  const host = url.hostname.toLowerCase();
  if (host !== "immoflux.ro" && !host.endsWith(".immoflux.ro")) {
    throw new ImageFetchError(`Gazdă nepermisă: ${host}.`);
  }
  if (url.username || url.password) throw new ImageFetchError("Adresa nu poate conține credențiale.");
  return url;
}

export function assertImageHeaders(headers: Headers): string {
  const type = (headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!type.startsWith("image/")) {
    throw new ImageFetchError(`Tip de conținut neacceptat: ${type || "necunoscut"}.`);
  }
  const length = Number(headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) {
    throw new ImageFetchError("Poza depășește 10 MB.");
  }
  return type;
}

async function readLimited(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new ImageFetchError("Răspuns fără conținut.");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new ImageFetchError("Poza depășește 10 MB.");
    }
    parts.push(value);
  }
  if (total === 0) throw new ImageFetchError("Poza este goală.");
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

/** Descarcă sigur o poză; redirecționările sunt urmate doar spre gazde permise. */
export async function downloadImage(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let url = assertAllowedImageUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetchImpl(url.toString(), {
          redirect: "manual",
          signal: controller.signal,
          headers: { Accept: "image/*" },
        });
      } catch (error) {
        if (controller.signal.aborted) throw new ImageFetchError("Timp de descărcare depășit (15 s).");
        throw new ImageFetchError(
          `Descărcare eșuată: ${error instanceof Error ? error.message : "eroare de rețea"}.`,
        );
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new ImageFetchError("Redirecționare fără destinație.");
        url = assertAllowedImageUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new ImageFetchError(`Serverul a răspuns ${response.status}.`);
      const contentType = assertImageHeaders(response.headers);
      const bytes = await readLimited(response);
      return { bytes, contentType };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ImageFetchError("Prea multe redirecționări.");
}

/** Starea rândului după o eroare; `attempts` include deja încercarea curentă. */
export function statusAfterError(attempts: number): "pending" | "failed" {
  return attempts < MAX_ATTEMPTS ? "pending" : "failed";
}

/** Poziția și marcajul de copertă față de pozele existente ale proprietății. */
export function placement(existing: { position: number | null; is_primary: boolean | null }[]): {
  position: number;
  isPrimary: boolean;
} {
  const max = existing.reduce((m, i) => Math.max(m, i.position ?? -1), -1);
  return { position: max + 1, isPrimary: !existing.some((i) => i.is_primary) };
}

/**
 * Oglinda regulii din `property_import_images_close_dead()`: rând `pending`
 * care și-a consumat toate încercările și nu mai e blocat → se închide `failed`.
 */
export function isDeadRow(
  row: { status: string; attempts: number; locked_until: string | null },
  now: Date = new Date(),
): boolean {
  if (row.status !== "pending" || row.attempts < MAX_ATTEMPTS) return false;
  return row.locked_until === null || Date.parse(row.locked_until) < now.getTime();
}

export function isUniqueConflict(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23505";
}

function extensionFor(contentType: string): string {
  const sub = contentType.split("/")[1] ?? "jpg";
  if (sub === "jpeg") return "jpg";
  return /^[a-z0-9]+$/.test(sub) ? sub : "jpg";
}

function fileNameFrom(url: string, contentType: string): string {
  const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "poza";
  const base = last.replace(/\.[a-z0-9]+$/i, "") || "poza";
  return `${base}.${extensionFor(contentType)}`;
}

type QueueRow = {
  id: string;
  job_id: string;
  property_id: string;
  source_url: string;
  ordering: number;
  attempts: number;
};

// Clientul admin, tipat lax (tabelele noi sunt accesate prin service role).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function processRow(admin: Admin, row: QueueRow, fetchImpl: typeof fetch): Promise<"done" | "pending" | "failed"> {
  try {
    const { data: property } = await admin
      .from("properties")
      .select("id,organization_id")
      .eq("id", row.property_id)
      .maybeSingle();
    if (!property) throw new ImageFetchError("Proprietatea nu mai există.");

    // Deja importată anterior (de ex. alt job): nu o descărcăm din nou.
    const { data: already } = await admin
      .from("property_images")
      .select("id")
      .eq("property_id", row.property_id)
      .eq("source_url", row.source_url)
      .maybeSingle();
    if (already) return await finish(admin, row, "done", null);

    const { bytes, contentType } = await downloadImage(row.source_url, fetchImpl);
    const path = mediaPath(property.organization_id, property.id, fileNameFrom(row.source_url, contentType));
    const upload = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, new Blob([bytes as BlobPart], { type: contentType }), { contentType, upsert: false });
    if (upload.error) throw new ImageFetchError(`Încărcare în stocare eșuată: ${upload.error.message}`);

    const { data: existing } = await admin
      .from("property_images")
      .select("position,is_primary")
      .eq("property_id", property.id);
    const { position, isPrimary } = placement(existing ?? []);

    const { error } = await admin.from("property_images").insert({
      organization_id: property.organization_id,
      property_id: property.id,
      url: path,
      storage_path: path,
      source_url: row.source_url,
      position,
      is_primary: isPrimary,
      width: null,
      height: null,
    });
    if (error) {
      await admin.storage.from(MEDIA_BUCKET).remove([path]).catch(() => {});
      if (isUniqueConflict(error)) return await finish(admin, row, "done", null);
      throw new ImageFetchError(`Salvare eșuată: ${error.message}`);
    }
    return await finish(admin, row, "done", null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Eroare necunoscută.";
    return await finish(admin, row, statusAfterError(row.attempts), message.slice(0, 500));
  }
}

async function finish(admin: Admin, row: QueueRow, status: "done" | "pending" | "failed", lastError: string | null) {
  await admin
    .from("property_import_images")
    .update({ status, last_error: lastError, locked_until: null })
    .eq("id", row.id);
  return status;
}

/** Recalculează contoarele jobului și îl închide când nu mai are poze în așteptare. */
async function refreshJob(admin: Admin, jobId: string) {
  const count = async (status: string) => {
    const { count: c } = await admin
      .from("property_import_images")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("status", status);
    return c ?? 0;
  };
  const [done, failed, pending] = await Promise.all([count("done"), count("failed"), count("pending")]);
  await admin
    .from("property_import_jobs")
    .update({
      images_done: done,
      images_failed: failed,
      ...(pending === 0 ? { status: "completed", finished_at: new Date().toISOString() } : {}),
    })
    .eq("id", jobId)
    .eq("status", "processing");
}

export async function runPropertyImportImages(options: { fetchImpl?: typeof fetch; budgetMs?: number } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as Admin;
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadline = Date.now() + (options.budgetMs ?? RUN_BUDGET_MS);
  const touchedJobs = new Set<string>();
  const totals = { done: 0, pending: 0, failed: 0 };

  while (Date.now() < deadline) {
    const { data: rows, error } = await admin.rpc("claim_property_import_images", {
      _batch_size: BATCH_SIZE,
      _lease_seconds: LEASE_SECONDS,
    });
    if (error) throw new Error(`Revendicarea pozelor a eșuat: ${error.message}`);
    const batch = (rows ?? []) as QueueRow[];
    if (batch.length === 0) break;
    for (const row of batch) {
      touchedJobs.add(row.job_id);
      if (Date.now() >= deadline) {
        // Buget epuizat: eliberăm rândul fără a consuma încercarea.
        await admin
          .from("property_import_images")
          .update({ locked_until: null, attempts: Math.max(0, row.attempts - 1) })
          .eq("id", row.id);
        continue;
      }
      const status = await processRow(admin, row, fetchImpl);
      totals[status] += 1;
    }
  }

  // Include și joburile ale căror rânduri moarte au fost închise la revendicare
  // (fără să fi fost procesate în această rulare).
  const { data: open } = await admin
    .from("property_import_jobs")
    .select("id")
    .eq("status", "processing")
    .limit(50);
  for (const job of (open ?? []) as { id: string }[]) touchedJobs.add(job.id);
  for (const jobId of touchedJobs) await refreshJob(admin, jobId);
  return { ...totals, jobs: touchedJobs.size };
}
