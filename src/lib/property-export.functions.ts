import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXPORT_SYNC_LIMIT, exportFileName, scopeExportRows } from "@/lib/property-export";
import type { ExportRequest } from "@/lib/property-export.server";

const SORTABLE = new Set(["created_at", "updated_at", "price", "surface", "usable_surface", "reference", "title", "published_at"]);

export const exportPropertiesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ExportRequest) => {
    if (!d || typeof d.organizationId !== "string" || !d.filters) throw new Error("Cerere invalidă.");
    return { ...d, sortColumn: SORTABLE.has(d.sortColumn) ? d.sortColumn : "created_at", placeChoices: Array.isArray(d.placeChoices) ? d.placeChoices : [] };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    if (!profile || profile.organization_id !== data.organizationId) throw new Error("Nu ai acces la această agenție.");
    const { data: isAdmin } = await supabase.rpc("is_org_admin");
    const { loadFilteredExportRows, buildExportCsv, auditExport } = await import("@/lib/property-export.server");
    let rows = await loadFilteredExportRows(supabase as never, data, userId);
    let importedByMe = new Set<string>();
    if (!isAdmin) {
      const { data: imp } = await supabase.from("private_listing_imports").select("property_id").eq("imported_by", userId);
      importedByMe = new Set((imp ?? []).map((r: { property_id: string }) => r.property_id));
    }
    rows = scopeExportRows(rows, { orgId: data.organizationId, userId, isAdmin: isAdmin === true, importedByMe });
    const { data: org } = await supabase.from("organizations").select("name").eq("id", data.organizationId).maybeSingle();
    const filename = exportFileName(org?.name ?? "agentie", new Date());
    if (rows.length > EXPORT_SYNC_LIMIT) {
      const { data: job, error } = await supabase.from("property_export_jobs")
        .insert({ organization_id: data.organizationId, requested_by: userId, property_ids: rows.map((r) => r.id), filename, total: rows.length })
        .select("id").single();
      if (error) throw new Error("Nu am putut porni exportul.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc("development_clone_kick" as never);
      return { mode: "background" as const, count: rows.length, jobId: job.id };
    }
    const csv = await buildExportCsv(supabase as never, rows);
    await auditExport(supabase as never, data.organizationId, userId, rows.length, "sync");
    return { mode: "sync" as const, count: rows.length, csv, filename };
  });

export const getPropertyExportDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => d)
  .handler(async ({ data, context }) => {
    // RLS: doar propriul export.
    const { data: job } = await context.supabase.from("property_export_jobs").select("id,status,file_path,filename,total").eq("id", data.jobId).maybeSingle();
    if (!job) throw new Error("Exportul nu există sau nu îți aparține.");
    if (job.status !== "done" || !job.file_path) return { status: job.status, url: null, filename: job.filename };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from("property-exports").createSignedUrl(job.file_path, 300, { download: job.filename });
    if (error) throw new Error("Nu am putut genera linkul de descărcare.");
    return { status: job.status, url: signed.signedUrl, filename: job.filename };
  });
