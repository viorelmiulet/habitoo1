/**
 * Endpoint public pentru ingestia anunțurilor de la scraper (hbsync).
 *
 * POST /api/public/listings/upsert
 * Header obligatoriu: x-scraper-secret (comparat cu HBSYNC_SECRET/SCRAPER_SECRET).
 * Body: { "listings": [ { source, external_id, ... } ] } — batch de 1–500.
 * Face upsert în `listings` pe (source, external_id) — idempotent: același
 * anunț trimis de două ori actualizează același rând.
 *
 * Imaginile (max 12/anunț) se salvează imediat cu URL-urile originale (cele
 * deja copiate se păstrează) și se pun în coada `listing_image_jobs`; worker-ul
 * /api/public/cron/listing-images le copiază în bucketul privat `listing-images`
 * și înlocuiește URL-ul, pe aceeași poziție, cu /api/public/listings/media/<id>.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { MAX_IMAGES_PER_LISTING, mergeIncomingImages, planImageJobs } from "@/lib/listing-images";

const MAX_LISTINGS_PER_CALL = 500;
export const LISTING_IMAGES_BUCKET = "listing-images";

/**
 * Transformă valori numerice venite ca text din hbsync ("4", "P+4", "120,5 mp", "")
 * în număr; textul gol sau fără cifre devine null, ca un câmp opțional să nu
 * respingă tot batch-ul. Numerele reale trec neschimbate.
 */
export function toLenientNumber(value: unknown, opts: { int?: boolean } = {}): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === "number") return opts.int && Number.isFinite(value) ? Math.round(value) : value;
  if (typeof value !== "string") return value;
  const match = value.replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  if (!Number.isFinite(n)) return null;
  return opts.int ? Math.round(n) : n;
}

const lenientNumber = (schema: z.ZodTypeAny, int = false) =>
  z.preprocess((v) => toLenientNumber(v, { int }), schema);

/** Ca lenientNumber, dar o valoare în afara intervalului devine null în loc de eroare. */
const lenientOptionalNumber = (schema: z.ZodNumber, int = false) =>
  z.preprocess((v) => {
    const n = toLenientNumber(v, { int });
    return typeof n === "number" && !schema.safeParse(n).success ? null : n;
  }, schema.nullish());

const listingSchema = z.object({
  source: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_.-]+$/),
  external_id: z.string().min(1).max(200),
  title: z.string().max(500).nullish(),
  price: lenientNumber(z.number().nonnegative().nullish()),
  currency: z.string().max(8).nullish(),
  price_per_m2: lenientNumber(z.number().nonnegative().nullish()),
  rooms: lenientNumber(z.number().int().nonnegative().nullish(), true),
  rooms_label: z.string().max(100).nullish(),
  surface: lenientNumber(z.number().nonnegative().nullish()),
  floor: z.string().max(50).nullish(),
  floors_count: lenientOptionalNumber(z.number().int().nonnegative(), true),
  year_built: lenientOptionalNumber(z.number().int().min(1800).max(2100), true),
  city: z.string().max(100).nullish(),
  zone: z.string().max(150).nullish(),
  neighborhood: z.string().max(150).nullish(),
  location: z.string().max(300).nullish(),
  county: z.string().max(100).nullish(),
  property_type: z.string().max(100).nullish(),
  transaction_type: z.string().max(50).nullish(),
  is_owner: z.boolean().nullish(),
  owner_type: z.string().max(50).nullish(),
  description: z.string().max(20_000).nullish(),
  period: z.string().max(100).nullish(),
  perioada: z.string().max(100).nullish(), // alias vechi, acceptat pentru compatibilitate
  furnished: z.string().max(50).nullish(),
  parking: z.string().max(50).nullish(),
  bca: z.string().max(300).nullish(),
  availability: z.string().max(100).nullish(),
  min_term: z.string().max(100).nullish(),
  plot_area: lenientOptionalNumber(z.number().nonnegative()),
  heating: z.string().max(100).nullish(),
  has_lift: z.string().max(50).nullish(),
  building_type: z.string().max(100).nullish(),
  url: z.string().url().max(2000).nullish(),
  phone: z.string().max(50).nullish(),
  images: z.array(z.string().url().max(2000)).max(50).nullish(),
  fingerprint: z.string().max(200).nullish(),
  scraped_at: z.string().datetime({ offset: true }).nullish(),
  published_at: z.string().datetime({ offset: true }).nullish(),
  raw_data: z.record(z.unknown()).nullish(),
});

const bodySchema = z.object({
  listings: z.array(listingSchema).min(1).max(MAX_LISTINGS_PER_CALL),
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Prefixul de perioadă pus la începutul descrierii (tabela nu are coloană dedicată). */
export function periodPrefix(period: string): string {
  const p = period.trim().toLowerCase();
  if (p === "luna" || p === "lună") return "(închiriere - preț pe lună)";
  if (p === "zi") return "(închiriere - preț pe zi)";
  return `(${period.trim()})`;
}

/** Prețul din datele structurate ale paginii Storia (salePrice / rentalPrice). */
export function parseStoriaPrice(html: string): { price: number; currency: string } | null {
  const m = /"(?:salePrice|rentalPrice)":\{"value":(\d+(?:\.\d+)?),"currency":"([A-Z]{3})"/.exec(html);
  if (!m) return null;
  const price = Number(m[1]);
  return Number.isFinite(price) && price > 0 ? { price, currency: m[2] } : null;
}

const STORIA_PAGE_TIMEOUT_MS = 8_000;
const STORIA_PAGE_MAX_BYTES = 3 * 1024 * 1024;

/** Citește prețul direct din pagina anunțului Storia; null la orice eșec. */
export async function fetchStoriaPrice(url: string): Promise<{ price: number; currency: string } | null> {
  if (!/^https:\/\/www\.storia\.ro\/ro\/oferta\//.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORIA_PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HabitooCRM/1.0)", Accept: "text/html" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > STORIA_PAGE_MAX_BYTES) return null;
    return parseStoriaPrice(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const TRANSACTION_LABELS: Record<string, string> = { sale: "Vânzare", lease: "Închiriere", rent: "Închiriere" };
const PROPERTY_LABELS: Record<string, string> = {
  apartment: "Apartament",
  house: "Casă",
  land: "Teren",
  office: "Birou",
  commercial: "Spațiu comercial",
  warehouse: "Depozit",
  unknown: "Altă proprietate",
};

/** Etichete românești unice, ca filtrele să nu vadă „sale” și „Vânzare” separat. */
export function labelTransaction(v: string | null | undefined): string | null | undefined {
  return v ? (TRANSACTION_LABELS[v.trim().toLowerCase()] ?? v) : v;
}
export function labelPropertyType(v: string | null | undefined): string | null | undefined {
  return v ? (PROPERTY_LABELS[v.trim().toLowerCase()] ?? v) : v;
}

function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "anunt"
  );
}

/**
 * Linkul public al anunțului. Storia: formatul vechi `/ro/ad/...` duce la 404,
 * cel valid este `/ro/oferta/<slug>-ID<cod>`. Când linkul lipsește, îl
 * refacem doar din id-ul real al portalului (Storia: slugul; Romimo: fișierul
 * `<cod>.html`, pe care portalul îl rezolvă indiferent de cale).
 */
export function normalizeListingUrl(
  source: string,
  url: string | null | undefined,
  externalId: string,
  title?: string | null,
): string | null {
  const raw = (url ?? "").trim();
  if (raw) {
    const storia = /^https?:\/\/(?:www\.)?storia\.ro\/ro\/(?:ad|oferta)\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(raw);
    if (storia) return `https://www.storia.ro/ro/oferta/${storia[1]}`;
    return raw;
  }
  if (source === "storia" && /^[a-z0-9-]+-ID[A-Za-z0-9]+$/i.test(externalId)) {
    return `https://www.storia.ro/ro/oferta/${externalId}`;
  }
  if (source === "romimo" && /^[a-z0-9]{16,}\.html$/i.test(externalId)) {
    return `https://www.romimo.ro/anunturi/anunt/${slugify(title ?? "")}/${externalId}`;
  }
  return null;
}

/** Strip ignored incoming fields and prepare only supported database fields. */
export function buildListingRow(input: unknown): Record<string, unknown> {
  const listing = listingSchema.parse(input);
  const row: Record<string, unknown> = {
    source: listing.source,
    external_id: listing.external_id,
    // Telefonul se păstrează pentru Anuntul.ro, Facebook și Homezz.ro (număr public în pagină); celelalte surse rămân fără.
    phone: ["anuntul", "facebook", "homezz"].includes(listing.source) ? (listing.phone ?? null) : null,
  };
  const skip = new Set(["source", "external_id", "phone", "perioada", "period", "rooms_label", "images"]);
  for (const [key, value] of Object.entries(listing)) {
    if (!skip.has(key) && value !== undefined) row[key] = value;
  }
  row.url = normalizeListingUrl(listing.source, listing.url, listing.external_id, listing.title);
  row.transaction_type = labelTransaction(listing.transaction_type);
  row.property_type = labelPropertyType(listing.property_type);
  return row;
}

type ExistingListingFields = {
  source: string;
  external_id: string;
  url: string | null;
  images: unknown;
};

/** Completează link/imagini lipsă din rândul deja salvat (același source + external_id). */
export function preserveExistingFields(
  rows: Record<string, unknown>[],
  existing: ExistingListingFields[],
): void {
  const byKey = new Map(existing.map((e) => [`${e.source}|${e.external_id}`, e]));
  for (const row of rows) {
    const old = byKey.get(`${row.source}|${row.external_id}`);
    if (!old) continue;
    if (!row.url && old.url) row.url = normalizeListingUrl(String(row.source), old.url, String(row.external_id));
    if (!row.images && Array.isArray(old.images) && old.images.length > 0) row.images = old.images;
  }
}

export const Route = createFileRoute("/api/public/listings/upsert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Cheie dedicată hbsync; SCRAPER_SECRET rămâne acceptat pentru compatibilitate.
        const expected = [process.env["HBSYNC_SECRET"], process.env["SCRAPER_SECRET"]].filter(
          (v): v is string => Boolean(v),
        );
        if (expected.length === 0) {
          console.error("[listings-upsert] HBSYNC_SECRET/SCRAPER_SECRET is not configured");
          return json({ success: false, error: "server_misconfigured" }, 500);
        }
        const provided = request.headers.get("x-scraper-secret") ?? "";
        if (!provided || !expected.some((key) => secretMatches(provided, key))) {
          return json({ success: false, error: "unauthorized" }, 401);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ success: false, error: "invalid_json" }, 400);
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return json(
            { success: false, error: "invalid_body", details: parsed.error.issues.slice(0, 5) },
            400,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const rows: Record<string, unknown>[] = [];
        for (const listing of parsed.data.listings) {
          const row = buildListingRow(listing);
          // Storia: prețul se citește din pagina anunțului (textul primit poate avea prețuri lipite).
          if (listing.source === "storia" && typeof row.url === "string") {
            const live = await fetchStoriaPrice(row.url);
            if (live) {
              row.price = live.price;
              row.currency = live.currency;
              const surface = typeof listing.surface === "number" ? listing.surface : null;
              if (surface && surface > 0) row.price_per_m2 = Math.round((live.price / surface) * 100) / 100;
            }
          }
          // Perioada (ex. „luna") nu are coloană: o punem la începutul descrierii.
          const period = (listing.period ?? listing.perioada)?.trim();
          if (period) {
            const prefix = periodPrefix(period);
            const desc = listing.description ?? "";
            if (!desc.startsWith(prefix)) {
              row.description = desc ? `${prefix}\n\n${desc}` : prefix;
            }
          }
          // Imaginile: URL-urile originale; copierea în storage se face în coadă.
          const remoteImages = (listing.images ?? []).slice(0, MAX_IMAGES_PER_LISTING);
          if (remoteImages.length > 0) row.images = remoteImages;
          rows.push(row);
        }

        // Rândurile existente: link/imagini lipsă și pozele deja copiate.
        const { data: existing } = await supabaseAdmin
          .from("listings")
          .select("id, source, external_id, url, images")
          .in("external_id", rows.map((r) => r.external_id as string));
        const existingRows = (existing ?? []) as (ExistingListingFields & { id: string })[];
        preserveExistingFields(rows, existingRows);
        const existingByKey = new Map(existingRows.map((e) => [`${e.source}|${e.external_id}`, e]));
        const doneByListing = new Map<string, Map<string, string>>();
        if (existingRows.length > 0) {
          const { data: done } = await supabaseAdmin
            .from("listing_image_jobs")
            .select("listing_id, source_url, stored_url")
            .in("listing_id", existingRows.map((e) => e.id))
            .eq("status", "done");
          for (const d of done ?? []) {
            if (!d.stored_url) continue;
            const m = doneByListing.get(d.listing_id) ?? new Map<string, string>();
            m.set(d.source_url, d.stored_url);
            doneByListing.set(d.listing_id, m);
          }
        }
        for (const [index, row] of rows.entries()) {
          const incoming = parsed.data.listings[index]?.images ?? [];
          if (incoming.length === 0) continue;
          const old = existingByKey.get(`${row.source}|${row.external_id}`);
          row.images = mergeIncomingImages(
            incoming,
            Array.isArray(old?.images) ? (old.images as string[]) : null,
            (old && doneByListing.get(old.id)) ?? new Map(),
          );
        }

        // Geography is canonicalized by the listings trigger for both insert and
        // re-import, using the app's locality/county nomenclature.
        const { data: saved, error } = await supabaseAdmin
          .from("listings")
          .upsert(rows as never, { onConflict: "source,external_id" })
          .select("id, images");

        if (error) {
          console.error(`[listings-upsert] upsert failed: ${error.message}`);
          return json({ success: false, error: "upsert_failed" }, 500);
        }

        // Coada pozelor: unic pe (anunț, URL sursă) — retrimiterea nu dublează.
        const jobs = (saved ?? []).flatMap((r) => planImageJobs(r.id, (r.images ?? []) as string[]));
        let queued = 0;
        if (jobs.length > 0) {
          const { error: queueError } = await supabaseAdmin
            .from("listing_image_jobs")
            .upsert(jobs, { onConflict: "listing_id,source_url", ignoreDuplicates: true });
          if (queueError) console.error(`[listings-upsert] image queue failed: ${queueError.message}`);
          else queued = jobs.length;
        }

        return json({ success: true, inserted: rows.length, images_queued: queued });
      },
    },
  },
});
