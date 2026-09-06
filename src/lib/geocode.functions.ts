/**
 * Geocodare adresă prin Nominatim (OpenStreetMap), apelată doar la cererea
 * explicită a agentului (buton „Localizează pe hartă”).
 * Politica Nominatim: User-Agent identificabil, max 1 cerere/secundă,
 * fără request-uri automate în buclă.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  query: z.string().trim().min(3).max(300),
});

const NOMINATIM_UA = "Habitoo CRM (contact@habitoo.ro)";
const MIN_INTERVAL_MS = 1100;
let lastCallAt = 0;

export type GeocodeResult = {
  ok: boolean;
  lat?: number;
  lng?: number;
  label?: string;
  message?: string;
};

export const geocodeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<GeocodeResult> => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", data.query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "ro");
    url.searchParams.set("addressdetails", "0");

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": NOMINATIM_UA, Accept: "application/json" },
      });
      if (!res.ok) {
        return { ok: false, message: `Serviciul de geocodare a răspuns ${res.status}.` };
      }
      const rows = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
      const hit = rows[0];
      const lat = hit?.lat ? Number(hit.lat) : NaN;
      const lng = hit?.lon ? Number(hit.lon) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return { ok: false, message: "Adresa nu a fost găsită. Poziționează pinul manual pe hartă." };
      }
      return {
        ok: true,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        label: hit?.display_name ?? undefined,
      };
    } catch {
      return { ok: false, message: "Geocodarea nu a putut fi realizată. Poziționează pinul manual." };
    }
  });
