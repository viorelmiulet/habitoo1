import type { SupabaseClient } from "@supabase/supabase-js";
import { checkListing, median, type CheckPortalReport } from "./rules";
import type { ListingCheckRow } from "./check.functions";
import type { PriceContext } from "./ai-suggestions";

type Db = SupabaseClient<any, any, any>;

export type ListingCheckDeps = {
  /** Încarcă cerințele portalurilor (validatorii existenți), după autorizare. */
  requirementReports?: (organizationId: string, propertyIds: string[], portalsByProperty: Map<string, string[]>) => Promise<Map<string, CheckPortalReport[]>>;
  /** Citiri agregate în agenție (mediane, descrieri duplicate). */
  orgReader?: () => Promise<Db>;
};

async function defaultRequirementReports(organizationId: string, ids: string[], portals: Map<string, string[]>) {
  const out = new Map<string, CheckPortalReport[]>();
  const wanted = [...new Set([...portals.values()].flat())];
  if (wanted.length === 0) return out;
  const [{ supabaseAdmin }, { loadRequirementSubjects }, { validatePortalRequirements }, { portalDisplayName }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/portals/requirements.server"),
    import("@/lib/portals/requirements"),
    import("@/lib/portals/registry"),
  ]);
  const subjects = await loadRequirementSubjects(supabaseAdmin as never, organizationId, ids);
  for (const id of ids) {
    const subject = subjects.get(id);
    if (!subject) continue;
    out.set(id, (portals.get(id) ?? []).map((portal) => {
      const r = validatePortalRequirements(portal, subject);
      return { portal, portalName: portalDisplayName(portal as never), missing: r.missing.map((m) => ({ label: m.label, requirement: m.requirement })) };
    }).filter((r) => r.missing.length > 0));
  }
  return out;
}

export async function runListingChecks(supabase: Db, userId: string, propertyIds: string[], deps: ListingCheckDeps = {}): Promise<ListingCheckRow[]> {
  const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([supabase.rpc("is_org_admin"), supabase.rpc("is_superadmin")]);
  const privileged = isAdmin === true || isSuper === true;
  const { data: rows, error } = await supabase.from("properties").select("*").in("id", propertyIds).is("deleted_at", null);
  if (error) throw new Error("Nu am putut citi anunțurile.");
  const visible = ((rows ?? []) as Record<string, any>[]).filter((r) => privileged || r.assigned_to === userId);
  if (visible.length !== propertyIds.length) throw new Error("Nu ai acces la unul sau mai multe dintre anunțurile selectate.");

  const ids = visible.map((r) => r.id as string);
  const [{ data: images }, { data: pubs }] = await Promise.all([
    supabase.from("property_images").select("property_id, is_primary, is_confidential, include_in_publish, storage_path, source_url, url, position").in("property_id", ids).order("position"),
    supabase.from("portal_publications").select("property_id, portal_key, enabled, last_error").in("property_id", ids),
  ]);
  const { portalDisplayName } = await import("@/lib/portals/registry");
  const pubsBy = new Map<string, any[]>();
  for (const p of (pubs ?? []) as any[]) pubsBy.set(p.property_id, [...(pubsBy.get(p.property_id) ?? []), p]);
  const imgBy = new Map<string, any[]>();
  for (const i of (images ?? []) as any[]) imgBy.set(i.property_id, [...(imgBy.get(i.property_id) ?? []), i]);

  const results: ListingCheckRow[] = [];
  const byOrg = new Map<string, Record<string, any>[]>();
  for (const r of visible) byOrg.set(r.organization_id, [...(byOrg.get(r.organization_id) ?? []), r]);
  const reader = deps.orgReader ?? (async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Db);

  for (const [orgId, list] of byOrg) {
    const portalsByProperty = new Map(list.map((r) => [r.id as string, (pubsBy.get(r.id) ?? []).filter((p) => p.enabled).map((p) => p.portal_key as string)]));
    const reports = await (deps.requirementReports ?? defaultRequirementReports)(orgId, list.map((r) => r.id), portalsByProperty);
    const db = await reader();
    for (const p of list) {
      const desc = typeof p.description === "string" ? p.description.trim() : "";
      let duplicateDescription = false;
      if (desc.length >= 50) {
        const { data: dups } = await db.from("properties").select("id").eq("organization_id", orgId).eq("description", p.description).neq("id", p.id).is("deleted_at", null).limit(1);
        duplicateDescription = (dups ?? []).length > 0;
      }
      let zoneMedianPerSqm: number | null = null;
      let priceContext: PriceContext | null = null;
      const forSale = p.for_sale === true || p.transaction_kind === "sale";
      if (forSale && p.city && p.property_type) {
        let q = db.from("properties").select("sale_price, usable_surface, land_surface").eq("organization_id", orgId).eq("city", p.city).eq("property_type", p.property_type).eq("for_sale", true).neq("id", p.id).is("deleted_at", null).not("sale_price", "is", null).limit(500);
        if (p.district) q = q.eq("district", p.district);
        const { data: comps } = await q;
        const area = (c: any) => (p.property_type === "land" ? c.land_surface : c.usable_surface);
        const values = ((comps ?? []) as any[]).filter((c) => c.sale_price > 0 && area(c) > 0).map((c) => c.sale_price / area(c));
        if (values.length >= 5) {
          zoneMedianPerSqm = median(values);
          if (zoneMedianPerSqm !== null) priceContext = { medianPerSqm: zoneMedianPerSqm, comparables: values.length, scope: [p.city, p.district].filter(Boolean).join(", ") + ", același tip, de vânzare" };
        }
      }
      const r = checkListing({
        property: p,
        images: (imgBy.get(p.id) ?? []).map((i) => ({ isPrimary: i.is_primary === true, isConfidential: i.is_confidential === true, includeInPublish: i.include_in_publish !== false, storagePath: i.storage_path ?? null, sourceUrl: i.source_url ?? null, url: i.url ?? null })),
        publications: (pubsBy.get(p.id) ?? []).map((x) => ({ portal: x.portal_key, portalName: portalDisplayName(x.portal_key), enabled: x.enabled === true, lastError: x.last_error ?? null })),
        portalReports: reports.get(p.id) ?? [],
        zoneMedianPerSqm,
        duplicateDescription,
      });
      results.push({ ...r, propertyId: p.id, reference: p.reference ?? null, title: p.title ?? null, priceContext });
    }
  }
  const order = new Map(propertyIds.map((id, i) => [id, i]));
  return results.sort((a, b) => (order.get(a.propertyId)! - order.get(b.propertyId)!));
}
