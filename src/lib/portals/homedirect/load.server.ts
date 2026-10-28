/**
 * HomeDirect (server-only): proprietatea → corpuri complete (mapper + agenție + agent + externalIds),
 * starea per tranzacție din `homedirect_listings` și amprentele agenției/agentului.
 */
import { CRM_URL } from "@/lib/host";
import { agencyLogoFeedUrl, agentPhotoUrl, isPropertyFeedEligible, type PropertyRow } from "@/lib/site-feed/mapper";
import { watermarkFromOrg } from "@/lib/watermark";
import { imo24ImageUrls } from "@/lib/portals/imo24/publish";
import { HOMEDIRECT_KEY_MISSING_MESSAGE, HOMEDIRECT_PORTAL_KEY, hasHomedirectKey } from "./config";
import { homedirectLocationStore, resolveHomedirectLocation, type HomedirectLocation } from "./locations.server";
import { mapPropertyToHomedirect, type HomedirectBody } from "./mapper";
import {
  homedirectAgencyPayload,
  homedirectAgentPayload,
  homedirectEmailReasons,
  homedirectFingerprint,
  withAccounts,
  type HomedirectAgency,
  type HomedirectAgent,
  type HomedirectFullBody,
  type HomedirectStored,
} from "./publish";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type HomedirectPrepared = {
  row: PropertyRow;
  location: HomedirectLocation;
  mapped: ReturnType<typeof mapPropertyToHomedirect>;
  agency: HomedirectAgency | null;
  agent: HomedirectAgent | null;
  imageWarnings: string[];
  reasons: string[];
};

/** Tot ce trebuie pentru o proprietate (fără apeluri de scriere la HomeDirect). */
export async function prepareHomedirect(db: any, row: PropertyRow): Promise<HomedirectPrepared> {
  const needsRate = [row.currency, row.sale_currency, row.rent_currency].some((c) => (c ?? "").toUpperCase() === "RON");
  const [{ data: images }, { data: org }, { data: profile }, rate, location] = await Promise.all([
    db.from("property_images").select("*").eq("organization_id", row.organization_id).eq("property_id", row.id),
    db.from("organizations").select("id,name,email,phone,material_phone,logo_url,logo_path,watermark_enabled").eq("id", row.organization_id).maybeSingle(),
    row.assigned_to
      ? db.from("profiles").select("id,full_name,email,phone,avatar_url").eq("id", row.assigned_to).maybeSingle()
      : Promise.resolve({ data: null }),
    needsRate
      ? (async () => {
          const { getRonEurRateForDate } = await import("@/lib/commissions-rates.server");
          const today = new Date().toISOString().slice(0, 10);
          return getRonEurRateForDate(today, { table: db.from("exchange_rates") as never }).then((r) => r.rate).catch(() => null);
        })()
      : Promise.resolve(undefined),
    homedirectLocationStore().then((store) =>
      resolveHomedirectLocation({ county: row.county ?? null, city: row.city ?? null, district: row.district ?? null, address: row.address ?? null }, store),
    ),
  ]);
  const pics = imo24ImageUrls((images ?? []) as never, { baseUrl: CRM_URL, watermark: watermarkFromOrg(org as never).enabled });
  const mapped = mapPropertyToHomedirect(row, { location, images: pics.urls, eurRonRate: needsRate ? (rate ?? null) : undefined });
  const agency = org ? homedirectAgencyPayload(org, agencyLogoFeedUrl(org.id, !!(org.logo_path || org.logo_url), CRM_URL)) : null;
  const agent = profile ? homedirectAgentPayload(profile, agentPhotoUrl(profile, CRM_URL)) : null;
  const reasons = [
    ...(hasHomedirectKey() ? [] : [HOMEDIRECT_KEY_MISSING_MESSAGE]),
    ...(mapped.ok ? [] : mapped.reasons),
    ...(location.status === "unverified" && hasHomedirectKey() ? [location.reason] : []),
    ...homedirectEmailReasons(agency, agent, !!row.assigned_to),
  ];
  return {
    row, location, mapped, agency, agent, reasons,
    imageWarnings: pics.warnings.map((w) => w.replace(/imo24\.ro/g, "HomeDirect")),
  };
}

/** Motivele blocante pentru fila Publicare (mapper, locație, emailuri, cheie). */
export async function homedirectReasonsFor(db: any, row: PropertyRow): Promise<string[]> {
  return (await prepareHomedirect(db, row)).reasons;
}

export type HomedirectBuild =
  | {
      ok: true;
      bodies: HomedirectFullBody[];
      warnings: string[];
      agency: { payload: HomedirectAgency; fingerprint: string };
      agent: { userId: string; payload: HomedirectAgent; fingerprint: string };
    }
  | { ok: false; reasons: string[] };

export async function buildHomedirectBodies(input: { organizationId: string; propertyId: string }): Promise<HomedirectBuild> {
  const db = await admin();
  const { data: p } = await db.from("properties").select("*")
    .eq("id", input.propertyId).eq("organization_id", input.organizationId).maybeSingle();
  if (!p) return { ok: false, reasons: ["Proprietatea nu a fost găsită."] };
  if (!isPropertyFeedEligible(p)) return { ok: false, reasons: ["Oferta nu este publicabilă: verifică statusul și publicarea pe site."] };
  const prep = await prepareHomedirect(db, p as PropertyRow);
  if (prep.reasons.length || !prep.mapped.ok || !prep.agency || !prep.agent) return { ok: false, reasons: prep.reasons };
  const accounts = { agency: prep.agency, agent: prep.agent, organizationId: input.organizationId, userId: p.assigned_to as string };
  return {
    ok: true,
    bodies: prep.mapped.bodies.map((b: HomedirectBody) => withAccounts(b, accounts)),
    warnings: [...prep.mapped.warnings.filter((w) => !w.startsWith("Ambele")), ...prep.imageWarnings],
    agency: { payload: prep.agency, fingerprint: homedirectFingerprint(prep.agency) },
    agent: { userId: p.assigned_to as string, payload: prep.agent, fingerprint: homedirectFingerprint(prep.agent) },
  };
}

export async function loadHomedirectStored(input: { organizationId: string; propertyId: string }): Promise<HomedirectStored[]> {
  const db = await admin();
  const { data } = await db.from("homedirect_listings")
    .select("external_id,transaction,homedirect_id,short_id,slug,url,status")
    .eq("organization_id", input.organizationId).eq("property_id", input.propertyId);
  return (data ?? []) as HomedirectStored[];
}

export async function saveHomedirectStates(input: { organizationId: string; propertyId: string }, states: HomedirectStored[]) {
  if (!states.length) return;
  const db = await admin();
  const now = new Date().toISOString();
  await db.from("homedirect_listings").upsert(
    states.map((s) => ({ ...s, organization_id: input.organizationId, property_id: input.propertyId, updated_at: now })),
    { onConflict: "organization_id,external_id" },
  );
}

export async function loadHomedirectPropertyState(input: { organizationId: string; propertyId: string }) {
  const db = await admin();
  const { data } = await db.from("properties").select("status,deleted_at")
    .eq("id", input.propertyId).eq("organization_id", input.organizationId).maybeSingle();
  return (data ?? null) as { status: string | null; deleted_at: string | null } | null;
}

export async function loadHomedirectFingerprints(organizationId: string, userId: string) {
  const db = await admin();
  const [{ data: conn }, { data: link }] = await Promise.all([
    db.from("portal_connections").select("settings").eq("organization_id", organizationId).eq("portal", HOMEDIRECT_PORTAL_KEY).maybeSingle(),
    db.from("portal_agent_links").select("sent_fingerprint").eq("organization_id", organizationId).eq("portal", HOMEDIRECT_PORTAL_KEY).eq("user_id", userId).maybeSingle(),
  ]);
  const settings = (conn?.settings ?? {}) as Record<string, unknown>;
  return {
    agency: typeof settings["agency_fingerprint"] === "string" ? (settings["agency_fingerprint"] as string) : null,
    agent: (link?.sent_fingerprint as string | null) ?? null,
  };
}

export async function saveHomedirectFingerprints(organizationId: string, userId: string, agency: string, agent: string) {
  const db = await admin();
  const now = new Date().toISOString();
  const { data: conn } = await db.from("portal_connections").select("id,settings")
    .eq("organization_id", organizationId).eq("portal", HOMEDIRECT_PORTAL_KEY).maybeSingle();
  if (conn) {
    await db.from("portal_connections").update({ settings: { ...((conn.settings ?? {}) as object), agency_fingerprint: agency } }).eq("id", conn.id);
  }
  await db.from("portal_agent_links").upsert(
    { organization_id: organizationId, portal: HOMEDIRECT_PORTAL_KEY, user_id: userId, external_id: userId, sent_fingerprint: agent, synced_at: now, last_error: null, updated_at: now },
    { onConflict: "organization_id,portal,user_id" },
  );
}

/** Agent eliminat din agenție: DELETE /agents la HomeDirect (doar dacă a fost provizionat), apoi legătura locală. */
export async function removeHomedirectAgent(organizationId: string, userId: string): Promise<void> {
  const db = await admin();
  const { data: link } = await db.from("portal_agent_links").select("id")
    .eq("organization_id", organizationId).eq("portal", HOMEDIRECT_PORTAL_KEY).eq("user_id", userId).maybeSingle();
  if (!link || !hasHomedirectKey()) return;
  const { deleteHomedirectAgent } = await import("./publish");
  const r = await deleteHomedirectAgent(organizationId, userId);
  if (r.ok) await db.from("portal_agent_links").delete().eq("id", link.id);
  else await db.from("portal_agent_links").update({ last_error: r.fail.message }).eq("id", link.id);
}
