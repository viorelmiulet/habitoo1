import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildOrgSyncPatch,
  diffOrgWithCompany,
  fetchCompany,
  lookupCompany,
  shouldSyncOrg,
  validateCui,
  type CompanyDiff,
  type LookupResult,
} from "@/lib/company-lookup";

/** Public (folosit la înregistrare): limitat pe IP, cache 24h, doar date publice ale firmei. */
export const lookupCompanyByCui = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ cui: z.string().max(20) }).parse(d))
  .handler(async ({ data }): Promise<LookupResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { serverLookupDeps } = await import("@/lib/company-lookup.server");
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    return lookupCompany(serverLookupDeps(supabaseAdmin, `cui_lookup:ip:${ip}`), data.cui);
  });

const ORG_COLS =
  "id,cui,legal_name,trade_registry_number,registered_address,material_address,postal_code,city,county,company_verified_at,company_sync_attempted_at";

async function adminOrgContext(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("is_org_admin");
  if (!isAdmin) throw new Error("Doar adminul agenției poate actualiza datele firmei.");
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error("Nu aparții unei agenții.");
  return profile.organization_id as string;
}

/**
 * După prima autentificare: completează din ANAF doar câmpurile goale ale organizației.
 * ANAF indisponibil → rămâne neverificat, se reîncearcă cel mult o dată pe zi.
 */
export const syncOrganizationFromCui = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ status: "skipped" | "verified" | "unverified"; changed: string[] }> => {
    const orgId = await adminOrgContext(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { serverLookupDeps } = await import("@/lib/company-lookup.server");
    const { data: org } = await supabaseAdmin.from("organizations").select(ORG_COLS).eq("id", orgId).maybeSingle();
    const now = new Date();
    if (!org || !shouldSyncOrg(org, now)) return { status: "skipped", changed: [] };
    await supabaseAdmin
      .from("organizations")
      .update({ company_sync_attempted_at: now.toISOString() } as never)
      .eq("id", orgId);
    const r = await fetchCompany(serverLookupDeps(supabaseAdmin, null), validateCui(org.cui ?? "")!);
    if (!r.ok) return { status: "unverified", changed: [] };
    const patch = buildOrgSyncPatch(org, r.company, now);
    const { error } = await supabaseAdmin.from("organizations").update(patch as never).eq("id", orgId);
    if (error) return { status: "unverified", changed: [] };
    const changed = Object.keys(patch).filter((k) => !k.startsWith("company_"));
    await supabaseAdmin.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: context.userId,
      action: "organization.company_synced_anaf",
      entity: "organizations",
      entity_id: orgId,
      new_values: patch,
    } as never);
    if (changed.length) {
      const { retryPendingImospotRequests } = await import("@/lib/portals/imospot-key-request.server");
      await retryPendingImospotRequests(orgId, context.userId).catch(() => undefined);
    }
    return { status: "verified", changed };
  });

/** Previzualizarea diferențelor față de ANAF (nu scrie nimic). */
export const previewAnafReload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true; diffs: CompanyDiff[]; status: string } | { ok: false; message: string }> => {
    const orgId = await adminOrgContext(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { serverLookupDeps } = await import("@/lib/company-lookup.server");
    const { data: org } = await supabaseAdmin.from("organizations").select(ORG_COLS).eq("id", orgId).maybeSingle();
    const cui = validateCui(org?.cui ?? "");
    if (!org || !cui) return { ok: false, message: "CUI-ul agenției lipsește sau este invalid." };
    const r = await fetchCompany(serverLookupDeps(supabaseAdmin, `cui_reload:org:${orgId}`), cui);
    if (!r.ok)
      return {
        ok: false,
        message: r.reason === "not_found" ? "ANAF nu are date pentru acest CUI." : "Registrul ANAF nu răspunde acum. Încearcă mai târziu.",
      };
    return { ok: true, diffs: diffOrgWithCompany(org, r.company), status: r.company.status };
  });

/** Aplică diferențele confirmate (refăcute pe server, nu luate din browser). */
export const applyAnafReload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fields: z.array(z.string().max(40)).max(10) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; changed: string[] }> => {
    const orgId = await adminOrgContext(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { serverLookupDeps } = await import("@/lib/company-lookup.server");
    const { data: org } = await supabaseAdmin.from("organizations").select(ORG_COLS).eq("id", orgId).maybeSingle();
    const cui = validateCui(org?.cui ?? "");
    if (!org || !cui) throw new Error("CUI-ul agenției lipsește sau este invalid.");
    const r = await fetchCompany(serverLookupDeps(supabaseAdmin, null), cui);
    if (!r.ok) throw new Error("Registrul ANAF nu răspunde acum. Încearcă mai târziu.");
    const diffs = diffOrgWithCompany(org, r.company).filter((d) => data.fields.includes(d.field));
    const patch: Record<string, string> = Object.fromEntries(diffs.map((d) => [d.field, d.next]));
    patch.company_status = r.company.status;
    patch.company_verified_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("organizations").update(patch as never).eq("id", orgId);
    if (error) throw new Error("Nu am putut salva datele firmei.");
    await supabaseAdmin.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: context.userId,
      action: "organization.company_reloaded_anaf",
      entity: "organizations",
      entity_id: orgId,
      old_values: Object.fromEntries(diffs.map((d) => [d.field, d.current])),
      new_values: patch,
    } as never);
    return { ok: true, changed: diffs.map((d) => d.field) };
  });
