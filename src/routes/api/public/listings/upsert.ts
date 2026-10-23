/**
 * Endpoint public pentru ingestia anunțurilor de la scraper (hbsync).
 *
 * POST /api/public/listings/upsert
 * Header obligatoriu: x-scraper-secret (comparat cu HBSYNC_SECRET/SCRAPER_SECRET).
 * Body: { "listings": [ { source, external_id, ... } ] } — batch de 1–500.
 * Face upsert în `listings` pe (source, external_id) — idempotent: același
 * anunț trimis de două ori actualizează același rând.
 *
 * Imaginile (max 12/anunț, max 5MB, timeout 10s) sunt descărcate și urcate în
 * bucketul privat `listing-images` sub <external_id>/; în coloana `images` se
 * salvează URL-uri stabile /api/public/listings/media/<id> care redirectează
 * către URL-uri semnate. O imagine care pică nu oprește importul.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

const MAX_LISTINGS_PER_CALL = 500;
const MAX_IMAGES_PER_LISTING = 12;
const IMAGE_TIMEOUT_MS = 10_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
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
  phone: z.string().max(50).nullish(),
  url: z.string().url().max(2000).nullish(),
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

/** Primul număr de mobil românesc din text (ex. descriere), sau null. */
export function phoneFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = /(?:\+?40|\b0)[\s.-]?7\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/.exec(text);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  return digits.startsWith("40") ? `0${digits.slice(2)}` : digits;
}

type ExistingListingFields = {
  source: string;
  external_id: string;
  url: string | null;
  phone: string | null;
  images: unknown;
};

/** Completează link/telefon/imagini lipsă din rândul deja salvat (același source + external_id). */
export function preserveExistingFields(
  rows: Record<string, unknown>[],
  existing: ExistingListingFields[],
): void {
  const byKey = new Map(existing.map((e) => [`${e.source}|${e.external_id}`, e]));
  for (const row of rows) {
    const old = byKey.get(`${row.source}|${row.external_id}`);
    if (!old) continue;
    if (!row.url && old.url) row.url = normalizeListingUrl(String(row.source), old.url, String(row.external_id));
    if (!row.phone && old.phone) row.phone = old.phone;
    if (!row.images && Array.isArray(old.images) && old.images.length > 0) row.images = old.images;
  }
}

/** Extensia din content-type; fallback la extensia din URL, apoi .jpg. */
function imageExtension(contentType: string | null, url: string): string {
  const fromType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  if (contentType) {
    const base = contentType.split(";")[0].trim().toLowerCase();
    if (fromType[base]) return fromType[base];
  }
  const match = /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.exec(url);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

/**
 * Descarcă și urcă imaginile unui anunț în bucketul privat; returnează
 * URL-urile stabile /api/public/listings/media/<uuid>. Eșecurile individuale
 * sunt ignorate — nu opresc importul.
 */
export async function mirrorListingImages(
  supabaseAdmin: {
    storage: {
      from: (bucket: string) => {
        upload: (
          path: string,
          body: Blob | ArrayBuffer,
          opts: { contentType?: string; upsert?: boolean },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  externalId: string,
  imageUrls: string[],
  baseUrl: string,
): Promise<string[]> {
  const stored: string[] = [];
  const safeId = externalId.replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 180);
  for (const [index, url] of imageUrls.slice(0, MAX_IMAGES_PER_LISTING).entries()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("image/")) continue;
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0 || buffer.byteLength > IMAGE_MAX_BYTES) continue;
      const path = `${safeId}/${index}-${crypto.randomUUID()}.${imageExtension(contentType, url)}`;
      const { error } = await supabaseAdmin.storage
        .from(LISTING_IMAGES_BUCKET)
        .upload(path, buffer, { contentType: contentType.split(";")[0].trim(), upsert: true });
      if (error) {
        console.error(`[listings-upsert] image upload failed for ${externalId}: ${error.message}`);
        continue;
      }
      stored.push(`${baseUrl}/api/public/listings/media/${crypto.randomUUID()}?p=${encodeURIComponent(path)}`);
    } catch {
      // Imaginea pică — continuăm cu celelalte.
    }
  }
  return stored;
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
        // URL-urile de imagini salvate în DB trebuie să fie publice și stabile,
        // nu origin-ul cererii (care poate fi localhost în dev).
        const { CRM_URL } = await import("@/lib/host");
        const baseUrl = CRM_URL;

        const rows: Record<string, unknown>[] = [];
        for (const listing of parsed.data.listings) {
          const row: Record<string, unknown> = {
            source: listing.source,
            external_id: listing.external_id,
          };
          // Câmpuri care nu sunt coloane reale sau se tratează separat.
          const skip = new Set(["source", "external_id", "perioada", "period", "rooms_label", "images"]);
          for (const [key, value] of Object.entries(listing)) {
            if (skip.has(key)) continue;
            if (value !== undefined) row[key] = value;
          }
          row.url = normalizeListingUrl(listing.source, listing.url, listing.external_id, listing.title);
          row.phone = (listing.phone ?? "").trim() || phoneFromText(listing.description);
          // Perioada (ex. „luna") nu are coloană: o punem la începutul descrierii.
          const period = (listing.period ?? listing.perioada)?.trim();
          if (period) {
            const prefix = periodPrefix(period);
            const desc = listing.description ?? "";
            if (!desc.startsWith(prefix)) {
              row.description = desc ? `${prefix}\n\n${desc}` : prefix;
            }
          }
          // Imaginile: descărcare + upload în storage; salvăm doar URL-urile.
          const remoteImages = (listing.images ?? []).slice(0, MAX_IMAGES_PER_LISTING);
          if (remoteImages.length > 0) {
            const mirrored = await mirrorListingImages(
              supabaseAdmin,
              listing.external_id,
              remoteImages,
              baseUrl,
            );
            if (mirrored.length > 0) row.images = mirrored;
          }
          rows.push(row);
        }

        // Un batch fără link/telefon/imagini nu trebuie să șteargă ce era deja salvat.
        const needsExisting = rows.filter((r) => !r.url || !r.phone || !r.images);
        if (needsExisting.length > 0) {
          const { data: existing } = await supabaseAdmin
            .from("listings")
            .select("source, external_id, url, phone, images")
            .in("external_id", needsExisting.map((r) => r.external_id as string));
          preserveExistingFields(rows, existing ?? []);
        }


        const { error } = await supabaseAdmin
          .from("listings")
          .upsert(rows as never, { onConflict: "source,external_id" });

        if (error) {
          console.error(`[listings-upsert] upsert failed: ${error.message}`);
          return json({ success: false, error: "upsert_failed" }, 500);
        }

        return json({ success: true, inserted: rows.length });
      },
    },
  },
});
