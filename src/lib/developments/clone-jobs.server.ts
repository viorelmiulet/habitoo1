import { runCloneJobOnce, type CloneJobItem, type CloneJobRow } from "./clone-jobs";

/** Production worker: admin client for the job RPCs (which recheck the requester's rights) and storage copies. */
export async function runDevelopmentCloneJobs(): Promise<{ runs: number; processed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { activatedPortalIds, applyPortalSelectionForOrg } = await import("@/lib/portals.functions");
  const { allPortals } = await import("@/lib/portals/registry");
  const rpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (n: string, p?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  const call = async (n: string, p?: Record<string, unknown>) => { const r = await rpc(n, p); if (r.error) throw new Error(r.error.message); return r.data; };
  let requestedBy = "";
  const db = {
    claim: async () => {
      const rows = (await call("claim_development_clone_job", { _lease_seconds: 120 })) as (CloneJobRow & { requested_by: string })[] | null;
      const j = rows?.[0] ?? null; requestedBy = j?.requested_by ?? ""; return j;
    },
    step: async (id: string) => (await call("development_clone_job_step", { _job_id: id })) as CloneJobItem | null,
    advance: async (id: string, index: number, ps: unknown[], pe: number) => { await call("development_clone_job_advance", { _job_id: id, _index: index, _portal_skipped: ps, _photo_errors: pe }); },
    release: async (id: string) => { await call("development_clone_job_release", { _job_id: id }); },
    finish: async (id: string, error: string | null) => { await call("development_clone_job_finish", { _job_id: id, _error: error }); },
  };
  const deps = {
    copyFile: async (from: string, to: string) => {
      const { error } = await supabaseAdmin.storage.from("property-media").copy(from, to);
      return !error || /exist/i.test(error.message); // resumed run: file already copied
    },
    removeImage: async (copyId: string, path: string) => { await supabaseAdmin.from("property_images").delete().eq("property_id", copyId).eq("storage_path", path); },
    activatedPortals: activatedPortalIds,
    definitions: allPortals,
    applySelection: async (orgId: string, propertyId: string, portals: string[]) => (await applyPortalSelectionForOrg({
      organizationId: orgId, superadmin: false, actorId: requestedBy,
      data: { propertyId, syncExisting: false, selections: portals.map((portalId) => ({ portalId, enabled: true })) },
    })).results,
  };
  const started = Date.now();
  let runs = 0, processed = 0;
  while (Date.now() - started < 20_000 && runs < 5) {
    const r = await runCloneJobOnce(db, deps);
    if (!r.jobId) break;
    runs += 1; processed += r.processed;
    if (!r.finished) break; // lease released; next tick continues this job
  }
  return { runs, processed };
}
