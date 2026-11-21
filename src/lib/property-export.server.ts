/** Server-only: citirea rândurilor pentru export și workerul joburilor mari. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPropertyFilterClauses } from "@/lib/property-filter-query";
import type { PropertyListFilters } from "@/lib/property-list-filters";
import { propertyTypeLabels } from "@/lib/labels";
import { PROPERTY_EXPORT_SELECT, buildPropertyCsv, exportRow, type ExportProperty } from "@/lib/property-export";

export type ExportRequest = {
  organizationId: string;
  filters: PropertyListFilters;
  placeChoices: unknown[];
  agentClause: { kind: "none" } | { kind: "unassigned" } | { kind: "agent"; id: string };
  restrictIds: string[] | null;
  sortColumn: string;
  sortAsc: boolean;
};
type Db = SupabaseClient;
const PAGE = 1000;

/** Toate rândurile filtrate (nu doar pagina curentă), citite cu RLS-ul apelantului. */
export async function loadFilteredExportRows(db: Db, req: ExportRequest, userId: string): Promise<ExportProperty[]> {
  if (req.restrictIds && req.restrictIds.length === 0) return [];
  const out: ExportProperty[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = (req.placeChoices.length ? db.rpc("search_properties_places", { _choices: req.placeChoices }) : db.from("properties"))
      .select(PROPERTY_EXPORT_SELECT).eq("organization_id", req.organizationId).is("deleted_at", null);
    q = applyPropertyFilterClauses(q as never, req.filters, { agentClause: req.agentClause, userId }) as typeof q;
    if (req.restrictIds) q = q.in("id", req.restrictIds);
    const { data, error } = await q.order(req.sortColumn, { ascending: req.sortAsc, nullsFirst: false }).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as ExportProperty[];
    out.push(...batch);
    if (batch.length < PAGE) return out;
  }
}

async function chunked<T>(ids: string[], size: number, fn: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const res: T[] = [];
  for (let i = 0; i < ids.length; i += size) res.push(...(await fn(ids.slice(i, i + size))));
  return res;
}

/** Construiește CSV-ul: agenți, ansambluri și portaluri publicate se citesc în loturi. */
export async function buildExportCsv(db: Db, rows: ExportProperty[]): Promise<string> {
  const { allPortals } = await import("@/lib/portals/registry");
  const portalName = new Map(allPortals().map((p) => [p.id as string, p.display_name]));
  const ids = rows.map((r) => r.id);
  const agentIds = [...new Set(rows.map((r) => r.assigned_to).filter((x): x is string => Boolean(x)))];
  const devIds = [...new Set(rows.map((r) => r.development_id).filter((x): x is string => Boolean(x)))];
  const agents = await chunked(agentIds, 200, async (p) => (await db.from("profiles").select("id,full_name").in("id", p)).data ?? []);
  const devs = await chunked(devIds, 200, async (p) => (await db.from("developments").select("id,name").in("id", p)).data ?? []);
  const pubs = await chunked(ids, 200, async (p) =>
    (await db.from("portal_publications").select("property_id,portal_key").in("property_id", p).eq("enabled", true).eq("status", "published")).data ?? []);
  const agentMap = new Map(agents.map((a: { id: string; full_name: string | null }) => [a.id, a.full_name ?? ""]));
  const devMap = new Map(devs.map((d: { id: string; name: string | null }) => [d.id, d.name ?? ""]));
  const pubMap = new Map<string, string[]>();
  for (const p of pubs as { property_id: string; portal_key: string }[]) {
    const list = pubMap.get(p.property_id) ?? [];
    list.push(portalName.get(p.portal_key) ?? p.portal_key);
    pubMap.set(p.property_id, list);
  }
  return buildPropertyCsv(rows.map((r) => exportRow(r, {
    agentName: (id) => (id ? agentMap.get(id) ?? "" : "Nealocat"),
    developmentName: (id) => (id ? devMap.get(id) ?? "" : ""),
    portals: (id) => (pubMap.get(id) ?? []).sort((a, b) => a.localeCompare(b, "ro")),
    typeLabel: (t) => propertyTypeLabels[t] ?? t,
  })));
}

export async function auditExport(db: Db, orgId: string, userId: string, rows: number, mode: "sync" | "background", jobId?: string) {
  await db.from("audit_logs").insert({
    organization_id: orgId, actor_id: userId, action: "properties.export_csv", entity: "properties",
    entity_id: jobId ?? null, new_values: { rows, mode },
  } as never);
}

/** Worker pentru exporturile mari: rândurile au fost deja stabilite (filtre + RLS) la creare. */
export async function runPropertyExportJobs(): Promise<{ exports: number }> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  let done = 0;
  for (let i = 0; i < 3; i++) {
    const { data: next } = await db.from("property_export_jobs").select("id").eq("status", "queued").order("created_at").limit(1).maybeSingle();
    if (!next) break;
    const { data: job } = await db.from("property_export_jobs").update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", next.id).eq("status", "queued").select("*").maybeSingle();
    if (!job) continue;
    try {
      const rows = await chunked(job.property_ids, 200, async (p) => {
        const { data, error } = await db.from("properties").select(PROPERTY_EXPORT_SELECT).in("id", p)
          .eq("organization_id", job.organization_id).is("deleted_at", null);
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as ExportProperty[];
      });
      const order = new Map(job.property_ids.map((id: string, n: number) => [id, n]));
      rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      const csv = await buildExportCsv(db as unknown as Db, rows);
      const path = `${job.organization_id}/${job.id}.csv`;
      const up = await db.storage.from("property-exports").upload(path, new Blob([csv], { type: "text/csv;charset=utf-8" }), { upsert: true, contentType: "text/csv;charset=utf-8" });
      if (up.error) throw new Error(up.error.message);
      await db.from("property_export_jobs").update({ status: "done", total: rows.length, file_path: path, finished_at: new Date().toISOString() }).eq("id", job.id);
      await auditExport(db as unknown as Db, job.organization_id, job.requested_by, rows.length, "background", job.id);
      await db.from("notifications").insert({
        organization_id: job.organization_id, user_id: job.requested_by, type: "property_export",
        title: "Exportul CSV este gata", body: `Exportul conține ${rows.length} proprietăți. Apasă pentru descărcare.`,
        link: `/app/properties?exportJob=${job.id}`,
      } as never);
      done++;
    } catch (e) {
      await db.from("property_export_jobs").update({ status: "error", last_error: e instanceof Error ? e.message : "Eroare", finished_at: new Date().toISOString() }).eq("id", job.id);
      await db.from("notifications").insert({ organization_id: job.organization_id, user_id: job.requested_by, type: "property_export",
        title: "Exportul CSV a eșuat", body: "Încearcă din nou din lista de proprietăți.", link: "/app/properties" } as never);
    }
  }
  return { exports: done };
}
