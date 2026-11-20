import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { CLONE_MAX, clonePortalIds, type CloneCopy, type CloneResult, type CloneSkip } from "./clone";

type Rpc = { rpc: (n: string, p: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
export type CloneDeps = {
  copyFile: (from: string, to: string) => Promise<boolean>;
  removeImage: (copyId: string, path: string) => Promise<void>;
  activatedPortals: (orgId: string) => Promise<Set<string>>;
  organizationOf: (developmentId: string) => Promise<string>;
  applySelection: (orgId: string, propertyId: string, portals: string[]) => Promise<{ portalId: string; ok: boolean; message: string | null }[]>;
};
const rpcResult = z.object({
  copies: z.array(z.object({ original_id: z.string(), original_reference: z.string().nullable(), copy_id: z.string(), copy_reference: z.string() })),
  skipped: z.array(z.object({ original_id: z.string(), original_reference: z.string().nullable(), reason: z.string() })),
  files: z.array(z.object({ from: z.string(), to: z.string(), copy_id: z.string() })),
});

/** RPC as the caller (permissions/RLS), then private file copies and portal preselection on each copy. */
export async function cloneToDevelopmentCore(user: Rpc, input: { developmentId: string; propertyIds: string[] }, deps: CloneDeps): Promise<CloneResult> {
  const { data, error } = await user.rpc("clone_properties_to_development", { _development_id: input.developmentId, _property_ids: input.propertyIds });
  if (error) throw error;
  const out = rpcResult.parse(data);
  let photoErrors = 0;
  for (const f of out.files) {
    const ok = await deps.copyFile(f.from, f.to).catch(() => false);
    if (!ok) { photoErrors += 1; await deps.removeImage(f.copy_id, f.to); }
  }
  const portalSkipped: CloneResult["portalSkipped"] = [];
  if (out.copies.length) {
    const org = await deps.organizationOf(input.developmentId);
    const portals = clonePortalIds(await deps.activatedPortals(org), (await import("@/lib/portals/registry")).allPortals());
    for (const c of out.copies) {
      if (!portals.length) break;
      try {
        for (const r of await deps.applySelection(org, c.copy_id, portals)) if (!r.ok) portalSkipped.push({ copy_id: c.copy_id, portal: r.portalId, reason: r.message ?? "Portal nebifat." });
      } catch (e) {
        portalSkipped.push({ copy_id: c.copy_id, portal: "*", reason: e instanceof Error ? e.message : "Portalurile nu au putut fi bifate." });
      }
    }
  }
  return { copies: out.copies as CloneCopy[], skipped: out.skipped as CloneSkip[], portalSkipped, photoErrors };
}

export const cloneToDevelopment = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ developmentId: z.string().uuid(), propertyIds: z.array(z.string().uuid()).min(1).max(CLONE_MAX) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { userId: string; supabase: Rpc };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { activatedPortalIds, applyPortalSelectionForOrg } = await import("@/lib/portals.functions");
    return cloneToDevelopmentCore(ctx.supabase, data, {
      copyFile: async (from, to) => !(await supabaseAdmin.storage.from("property-media").copy(from, to)).error,
      removeImage: async (copyId, path) => { await supabaseAdmin.from("property_images").delete().eq("property_id", copyId).eq("storage_path", path); },
      activatedPortals: activatedPortalIds,
      organizationOf: async (id) => {
        const { data: d } = await supabaseAdmin.from("developments").select("organization_id").eq("id", id).single();
        return d!.organization_id as string;
      },
      applySelection: async (orgId, propertyId, portals) => (await applyPortalSelectionForOrg({
        organizationId: orgId, superadmin: false, actorId: ctx.userId,
        data: { propertyId, syncExisting: false, selections: portals.map((portalId) => ({ portalId, enabled: true })) },
      })).results,
    });
  });
