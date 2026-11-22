import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNoActiveImpersonation } from "@/lib/impersonation.functions";

type Auth = { userId: string; supabase: { rpc: (name: "is_superadmin") => PromiseLike<{ data: boolean | null; error: unknown }> } };
async function authorize(context: Auth) {
  const role = await context.supabase.rpc("is_superadmin");
  if (role.error || role.data !== true) throw new Error("Acces refuzat: importul IMMOFLUX este permis exclusiv SuperAdmin.");
  await assertNoActiveImpersonation(context.userId);
}

export type ImmofluxImportJobView = {
  id: string; organizationId: string; organizationName: string | null; requestedBy: string; requestedByName: string | null;
  status: string; createdAt: string; finishedAt: string | null; nextPage: number; lastPage: number | null; total: number | null;
  mode: string; imported: number; existing: number; errors: number; unmappedCodes: string[]; imagesFailed: number; imagesTotal: number;
  lastError: string | null; report: { immofluxId: string | null; ref?: string | null; kind: string; message: string }[];
};

/** Pornește importul pentru agenția indicată; configurarea (și deci agenția țintă) se citește din baza de date. */
export const startImmofluxImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid(), mode: z.enum(["import", "repair"]).default("import") }).parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context);
    const repair = data.mode === "repair";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const config = await supabaseAdmin.from("immoflux_connections").select("organization_id,enabled").eq("organization_id", data.organizationId).maybeSingle();
    if (config.error || !config.data) throw new Error("Salvează mai întâi configurarea IMMOFLUX.");
    if (!config.data.enabled) throw new Error("Activează importul IMMOFLUX înainte de a-l porni.");
    const org = config.data.organization_id;
    const imageJob = await supabaseAdmin.from("property_import_jobs").insert({ organization_id: org, created_by: context.userId, source: "immoflux", file_name: repair ? "API IMMOFLUX – completare" : "API IMMOFLUX", status: "processing" }).select("id").single();
    if (imageJob.error || !imageJob.data) throw new Error("Importul nu a putut fi pornit.");
    const job = await supabaseAdmin.from("immoflux_import_jobs").insert({ organization_id: org, requested_by: context.userId, image_job_id: imageJob.data.id, mode: data.mode }).select("id").single();
    if (job.error || !job.data) {
      await supabaseAdmin.from("property_import_jobs").delete().eq("id", imageJob.data.id);
      throw new Error(job.error?.code === "23505" ? "Un import IMMOFLUX rulează deja pentru această agenție." : "Importul nu a putut fi pornit.");
    }
    await supabaseAdmin.from("audit_logs").insert({ organization_id: org, actor_id: context.userId, created_by: context.userId, action: repair ? "immoflux.repair_started" : "immoflux.import_started", entity: "immoflux_import_jobs", entity_id: job.data.id, new_values: {} });
    await supabaseAdmin.rpc("development_clone_kick" as never);
    return { jobId: job.data.id };
  });

export const listImmofluxImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }): Promise<ImmofluxImportJobView[]> => {
    await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("immoflux_import_jobs").select("*").order("created_at", { ascending: false }).limit(100);
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: jobs, error } = await q;
    if (error) throw new Error("Istoricul importurilor nu poate fi citit.");
    const rows = jobs ?? [];
    const orgIds = [...new Set(rows.map((j) => j.organization_id))];
    const userIds = [...new Set(rows.map((j) => j.requested_by))];
    const imageIds = rows.map((j) => j.image_job_id).filter((x): x is string => Boolean(x));
    const [orgs, users, images] = await Promise.all([
      orgIds.length ? supabaseAdmin.from("organizations").select("id,name").in("id", orgIds) : Promise.resolve({ data: [] }),
      userIds.length ? supabaseAdmin.from("profiles").select("id,full_name").in("id", userIds) : Promise.resolve({ data: [] }),
      imageIds.length ? supabaseAdmin.from("property_import_jobs").select("id,images_total,images_failed").in("id", imageIds) : Promise.resolve({ data: [] }),
    ]);
    const orgName = new Map((orgs.data ?? []).map((o: { id: string; name: string | null }) => [o.id, o.name]));
    const userName = new Map((users.data ?? []).map((u: { id: string; full_name: string | null }) => [u.id, u.full_name]));
    const img = new Map((images.data ?? []).map((i: { id: string; images_total: number; images_failed: number }) => [i.id, i]));
    return rows.map((j) => ({
      id: j.id, organizationId: j.organization_id, organizationName: orgName.get(j.organization_id) ?? null,
      requestedBy: j.requested_by, requestedByName: userName.get(j.requested_by) ?? null, status: j.status,
      createdAt: j.created_at, finishedAt: j.finished_at, nextPage: j.next_page, lastPage: j.last_page, total: j.total,
      mode: j.mode, imported: j.imported_count, existing: j.existing_count, errors: j.error_count, unmappedCodes: j.unmapped_codes,
      imagesFailed: j.image_job_id ? img.get(j.image_job_id)?.images_failed ?? 0 : 0, imagesTotal: j.image_job_id ? img.get(j.image_job_id)?.images_total ?? 0 : 0,
      lastError: j.last_error, report: (Array.isArray(j.report) ? j.report : []) as ImmofluxImportJobView["report"],
    }));
  });
