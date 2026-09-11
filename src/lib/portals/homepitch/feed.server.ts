/**
 * Construcția datelor expuse către HomePitch (server-only).
 *
 * Selecția: doar ofertele publicabile ale agenției (aceleași reguli ca feedul
 * existent) și bifate pentru portalul „homepitch” în `portal_publications`.
 * Ofertele fără coordonate, fără email de agent sau în altă monedă decât EUR
 * sunt EXCLUSE explicit, cu motivul exact (folosit în diagnosticare).
 */
import {
  FEED_PUBLIC_STATUSES,
  type ProfileRow,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";
import { mapPropertyToHomePitch, type HomePitchProperty } from "./mapper";

export type HomePitchExclusion = { propertyId: string; title: string; reasons: string[] };

export type HomePitchFeedResult = {
  properties: HomePitchProperty[];
  /** Câte oferte au trecut filtrele înainte de paginare. */
  total: number;
  selected: number;
  excluded: HomePitchExclusion[];
  warnings: string[];
};

export type HomePitchFeedQuery = {
  organizationId: string;
  baseUrl: string;
  limit?: number;
  offset?: number;
  updatedSince?: string | null;
  isActiveOnly?: boolean;
  /** Restrânge la o singură ofertă (endpointul de detalii). */
  propertyId?: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Ofertele bifate pentru HomePitch de agenție. */
async function selectedPropertyIds(organizationId: string): Promise<Set<string>> {
  const db = await admin();
  const { data } = await db
    .from("portal_publications")
    .select("property_id")
    .eq("organization_id", organizationId)
    .eq("portal_key", "homepitch")
    .eq("enabled", true);
  return new Set((data ?? []).map((row) => row.property_id));
}

export async function buildHomePitchFeed(query: HomePitchFeedQuery): Promise<HomePitchFeedResult> {
  const db = await admin();
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);

  let select = db
    .from("properties")
    .select("*")
    .eq("organization_id", query.organizationId)
    .eq("publish_status", "published")
    .is("deleted_at", null)
    .in("status", query.isActiveOnly ? ["active"] : [...FEED_PUBLIC_STATUSES]);
  if (query.propertyId) select = select.eq("id", query.propertyId);
  if (query.updatedSince) select = select.gte("updated_at", query.updatedSince);

  const { data, error } = await select.order("updated_at", { ascending: false });
  if (error) throw error;

  const selectedIds = await selectedPropertyIds(query.organizationId);
  const rows = ((data ?? []) as PropertyRow[]).filter((row) => selectedIds.has(row.id));

  const ids = rows.map((r) => r.id);
  const agentIds = [
    ...new Set(rows.map((r) => r.assigned_to).filter((v): v is string => Boolean(v))),
  ];
  const [imagesResult, agentsResult] = await Promise.all([
    ids.length
      ? db
          .from("property_images")
          .select("*")
          .eq("organization_id", query.organizationId)
          .in("property_id", ids)
      : Promise.resolve({ data: [] as PropertyImageRow[] }),
    agentIds.length
      ? db.from("profiles").select("id, full_name, email, phone").in("id", agentIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            full_name: string;
            email: string | null;
            phone: string | null;
          }[],
        }),
  ]);

  const imagesByProperty = new Map<string, PropertyImageRow[]>();
  for (const img of (imagesResult.data ?? []) as PropertyImageRow[]) {
    const list = imagesByProperty.get(img.property_id) ?? [];
    list.push(img);
    imagesByProperty.set(img.property_id, list);
  }
  const agentById = new Map((agentsResult.data ?? []).map((a) => [a.id, a]));

  const properties: HomePitchProperty[] = [];
  const excluded: HomePitchExclusion[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const result = mapPropertyToHomePitch(row, {
      baseUrl: query.baseUrl,
      images: imagesByProperty.get(row.id) ?? [],
      agent: row.assigned_to
        ? ((agentById.get(row.assigned_to) ?? null) as Pick<
            ProfileRow,
            "full_name" | "email" | "phone"
          > | null)
        : null,
    });
    if (result.ok) {
      properties.push(result.property);
      warnings.push(...result.warnings);
    } else {
      excluded.push({ propertyId: row.id, title: row.title, reasons: result.reasons });
    }
  }

  return {
    properties: properties.slice(offset, offset + limit),
    total: properties.length,
    selected: rows.length,
    excluded,
    warnings: [...new Set(warnings)],
  };
}

export type HomePitchAgentIdentity = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  agency_name: string;
};

/**
 * Identitatea returnată de `/agents/me`. Cheia este agency-wide (recomandarea
 * HomePitch pentru acest caz), deci returnăm agenția și contactul principal.
 */
export async function homepitchAgentIdentity(
  organizationId: string,
): Promise<HomePitchAgentIdentity | null> {
  const db = await admin();
  const [{ data: org }, { data: profiles }] = await Promise.all([
    db.from("organizations").select("name, email, phone").eq("id", organizationId).maybeSingle(),
    db
      .from("profiles")
      .select("full_name, email, phone, created_at")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);
  if (!org) return null;
  const primary = (profiles ?? [])[0] ?? null;
  const parts = (primary?.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    email: primary?.email ?? org.email ?? null,
    first_name: parts[0] ?? null,
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
    phone: primary?.phone ?? org.phone ?? null,
    agency_name: org.name,
  };
}
