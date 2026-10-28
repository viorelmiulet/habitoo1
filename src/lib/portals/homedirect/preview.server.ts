/** Datele reale pentru previzualizarea HomeDirect (server-only, doar citire în Habitoo). */
import { CRM_URL } from "@/lib/host";
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { watermarkFromOrg } from "@/lib/watermark";
import { imo24ImageUrls } from "@/lib/portals/imo24/publish";
import { homedirectLocationStore, resolveHomedirectLocation, type HomedirectLocation } from "./locations.server";
import { mapPropertyToHomedirect, type HomedirectBody } from "./mapper";

export type HomedirectPreview = {
  ok: boolean;
  bodies: HomedirectBody[];
  reasons: string[];
  warnings: string[];
  location: HomedirectLocation;
};

export async function buildHomedirectPreview(propertyId: string): Promise<HomedirectPreview> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: p } = await admin.from("properties").select("*").eq("id", propertyId).maybeSingle();
  if (!p) throw new Error("Proprietatea nu a fost găsită.");
  const row = p as PropertyRow;
  const needsRate = [row.currency, row.sale_currency, row.rent_currency].some((c) => (c ?? "").toUpperCase() === "RON");
  const [{ data: images }, { data: org }, rate, location] = await Promise.all([
    admin.from("property_images").select("*").eq("organization_id", row.organization_id).eq("property_id", propertyId),
    admin.from("organizations").select("watermark_enabled").eq("id", row.organization_id).maybeSingle(),
    needsRate
      ? (async () => {
          const { getRonEurRateForDate } = await import("@/lib/commissions-rates.server");
          const today = new Date().toISOString().slice(0, 10);
          return getRonEurRateForDate(today, { table: admin.from("exchange_rates") as never }).then((r) => r.rate).catch(() => null);
        })()
      : Promise.resolve(undefined),
    homedirectLocationStore().then((store) =>
      resolveHomedirectLocation({ county: row.county ?? null, city: row.city ?? null, district: row.district ?? null, address: row.address ?? null }, store),
    ),
  ]);
  const pics = imo24ImageUrls((images ?? []) as never, { baseUrl: CRM_URL, watermark: watermarkFromOrg(org as never).enabled });
  const mapped = mapPropertyToHomedirect(row, { location, images: pics.urls, eurRonRate: needsRate ? (rate ?? null) : undefined });
  const warnings = [...mapped.warnings, ...pics.warnings.map((w) => w.replace(/imo24\.ro/g, "HomeDirect"))];
  return mapped.ok
    ? { ok: true, bodies: mapped.bodies, reasons: [], warnings, location }
    : { ok: false, bodies: [], reasons: mapped.reasons, warnings, location };
}
