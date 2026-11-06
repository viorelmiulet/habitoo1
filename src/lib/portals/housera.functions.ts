import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { HOUSERA_MISSING_MESSAGE, HOUSERA_TEST_OK_MESSAGE } from "./housera/config";

type Ctx = { userId: string; supabase: { rpc(name: "is_superadmin"): PromiseLike<{ data: boolean | null }> } };
const orgSchema = z.object({ organizationId: z.string().uuid() });

async function requireSuperadmin(context: unknown, organizationId: string) {
  const { data } = await (context as Ctx).supabase.rpc("is_superadmin");
  if (data !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: org } = await supabaseAdmin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
  if (!org) throw new Error("Agenția nu a fost găsită.");
}

type AdminCtx = Ctx & { supabase: { rpc(name: "is_org_admin"): PromiseLike<{ data: boolean | null }>; from(name: "profiles"): { select(c: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: { organization_id: string | null } | null }> } } } } };
/** agency_admin al propriei agenții sau SuperAdmin pentru orice agenție. */
async function requireAgencyAdminOrSuperadmin(context: unknown, organizationId: string) {
  const c = context as AdminCtx;
  const { data: superadmin } = await c.supabase.rpc("is_superadmin");
  if (superadmin === true) return requireSuperadmin(context, organizationId);
  const { data: admin } = await c.supabase.rpc("is_org_admin");
  const { data: profile } = await c.supabase.from("profiles").select("organization_id").eq("id", c.userId).maybeSingle();
  if (admin !== true || profile?.organization_id !== organizationId) throw new Error("Acces refuzat: poți conecta Housera doar pentru agenția ta.");
}

export const startHouseraConnect = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => orgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAgencyAdminOrSuperadmin(context, data.organizationId);
    const { houseraConfigured } = await import("./housera/config");
    if (!houseraConfigured(process.env)) throw new Error(HOUSERA_MISSING_MESSAGE);
    const { loadHouseraConnection, houseraOAuthDependencies } = await import("./housera/store.server");
    const row = await loadHouseraConnection(data.organizationId);
    if (row?.activated !== true) throw new Error("Activează mai întâi Housera pentru agenție.");
    const { startHouseraAuthorization } = await import("./housera/oauth.server");
    const { deps } = await houseraOAuthDependencies();
    return { url: await startHouseraAuthorization(data.organizationId, context.userId, deps) };
  });

export const disconnectHousera = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => orgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAgencyAdminOrSuperadmin(context, data.organizationId);
    const { clearHouseraKey } = await import("./housera/store.server");
    await clearHouseraKey(data.organizationId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("portal_operation_logs").insert({ organization_id: data.organizationId, portal: "housera", operation: "disconnect", success: true, actor_id: context.userId });
    return { ok: true as const };
  });

export const getHouseraAgencyStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => orgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context, data.organizationId);
    const { houseraConfigured, houseraEnv, maskHouseraKey, houseraOAuthInfo } = await import("./housera/config");
    const { loadHouseraConnection, loadHouseraKey } = await import("./housera/store.server");
    const row = await loadHouseraConnection(data.organizationId);
    const key = row?.portal_credentials_encrypted ? await loadHouseraKey(data.organizationId) : null;
    return {
      configured: houseraConfigured(process.env),
      env: houseraEnv(process.env),
      keyMask: maskHouseraKey(key),
      activated: row?.activated === true,
      oauth: houseraOAuthInfo(row?.settings),
      reconnectRequired: (row?.settings as Record<string, unknown> | null)?.["reconnect_required"] === true,
      lastError: row?.last_sync_error ?? null,
      lastCheckedAt: row?.last_sync_at ?? null,
    };
  });

export const saveHouseraSandboxKey = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => orgSchema.extend({ key: z.string().trim().min(10).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context, data.organizationId);
    const { houseraEnv, houseraKeyMode, maskHouseraKey } = await import("./housera/config");
    if (houseraEnv(process.env) !== "staging") throw new Error("Cheia de sandbox se poate salva doar în mediul staging.");
    if (houseraKeyMode(data.key) !== "test") throw new Error("Cheia trebuie să aibă forma <număr>|hsr_test_….");
    const { saveHouseraKey } = await import("./housera/store.server");
    await saveHouseraKey(data.organizationId, data.key, context.userId);
    return { keyMask: maskHouseraKey(data.key) };
  });

export const testHouseraConnection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => orgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context, data.organizationId);
    const { houseraBaseUrl, houseraConfigured } = await import("./housera/config");
    const { loadHouseraKey, markHouseraReconnect } = await import("./housera/store.server");
    const { createHouseraClient, HouseraError } = await import("./housera/client.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const started = Date.now();
    const log = (success: boolean, error_message: string | null) =>
      supabaseAdmin.from("portal_operation_logs").insert({
        organization_id: data.organizationId, portal: "housera", operation: "test_connection",
        success, error_message, actor_id: context.userId, duration_ms: Date.now() - started,
      });
    if (!houseraConfigured(process.env)) { await log(false, HOUSERA_MISSING_MESSAGE); return { ok: false as const, message: HOUSERA_MISSING_MESSAGE }; }
    const key = await loadHouseraKey(data.organizationId);
    if (!key) { const m = "Agenția nu are o cheie de conexiune Housera."; await log(false, m); return { ok: false as const, message: m }; }
    try {
      const client = createHouseraClient({ key, baseUrl: houseraBaseUrl(process.env), onUnauthorized: () => markHouseraReconnect(data.organizationId) });
      await client.request("account/listings", { query: { fields: "code,status", per_page: 1 } });
      await supabaseAdmin.from("portal_connections")
        .update({ last_sync_status: "ok", last_sync_error: null, last_sync_at: new Date().toISOString() })
        .eq("organization_id", data.organizationId).eq("portal", "housera");
      await log(true, null);
      return { ok: true as const, message: HOUSERA_TEST_OK_MESSAGE };
    } catch (e) {
      const message = e instanceof HouseraError ? e.message : "Conexiunea Housera nu a putut fi verificată.";
      await log(false, message);
      return { ok: false as const, message };
    }
  });

// ---------- H3: nomenclator și previzualizarea mapării (fără apeluri de scriere) ----------
async function requirePlatformSuperadmin(context: unknown) {
  const { data } = await (context as Ctx).supabase.rpc("is_superadmin");
  if (data !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
}

export const getHouseraSchemaStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }) => {
    await requirePlatformSuperadmin(context);
    const { loadHouseraSchema } = await import("./housera/taxonomy.server");
    const c = await loadHouseraSchema(process.env);
    return c ? { synced: true as const, env: c.env, fetchedAt: c.fetchedAt, version: c.schema.version ?? null, featureCount: c.schema.features.length, affected: c.affected } : { synced: false as const };
  });

export const refreshHouseraSchemaNow = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }) => {
    await requirePlatformSuperadmin(context);
    const { refreshHouseraSchema } = await import("./housera/taxonomy.server");
    const r = await refreshHouseraSchema(process.env, context.userId);
    return { status: r.status, affected: r.cached.affected };
  });

export const listHouseraPreviewProperties = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => orgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("properties").select("id, title, reference")
      .eq("organization_id", data.organizationId).is("deleted_at", null)
      .order("updated_at", { ascending: false }).limit(200);
    return (rows ?? []).map((r) => ({ id: r.id, label: `${r.reference ? `${r.reference} · ` : ""}${r.title}` }));
  });

export const previewHouseraMapping = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => orgSchema.extend({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context, data.organizationId);
    const { loadHouseraMapping } = await import("./housera/listing.server");
    return loadHouseraMapping(data.organizationId, data.propertyId, context.userId);
  });

/** H4: POST listings/validate (Housera nu salvează nimic). Doar coduri/câmpuri/avertismente. */
export const validateHouseraListing = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => orgSchema.extend({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context, data.organizationId);
    const { houseraBaseUrl, houseraConfigured } = await import("./housera/config");
    if (!houseraConfigured(process.env)) throw new Error(HOUSERA_MISSING_MESSAGE);
    const { loadHouseraKey, markHouseraReconnect } = await import("./housera/store.server");
    const key = await loadHouseraKey(data.organizationId);
    if (!key) throw new Error("Agenția nu are o cheie de conexiune Housera.");
    const { loadHouseraMapping } = await import("./housera/listing.server");
    const { createHouseraClient, HouseraError } = await import("./housera/client.server");
    const { sortKeysDeep, houseraWarningsText } = await import("./housera/publish");
    const mapped = await loadHouseraMapping(data.organizationId, data.propertyId, context.userId);
    const client = createHouseraClient({ key, baseUrl: houseraBaseUrl(process.env), onUnauthorized: () => markHouseraReconnect(data.organizationId) });
    const results: Array<{ externalRef: string; transaction: string; valid: boolean; errors: string[]; warnings: string[] }> = [];
    for (const l of mapped.listings) {
      try {
        const r = await client.request<{ valid?: boolean; errors?: unknown; warnings?: unknown } | null>("listings/validate", { method: "POST", body: sortKeysDeep(l.payload) });
        const errs = Array.isArray(r?.errors) ? (r!.errors as Array<Record<string, unknown>>).map((e) => `${String(e.code ?? "eroare")}${typeof e.pointer === "string" ? ` (${e.pointer.replace(/^\/+/, "")})` : ""}`) : [];
        results.push({ externalRef: l.externalRef, transaction: l.transaction, valid: r?.valid === true && errs.length === 0, errors: errs, warnings: houseraWarningsText(r?.warnings) });
      } catch (e) {
        if (e instanceof HouseraError && e.kind === "validation") {
          results.push({ externalRef: l.externalRef, transaction: l.transaction, valid: false, errors: e.fields.length ? e.fields.map((f, i) => `${e.codes[i] ?? e.codes[0] ?? "invalid"} (${f})`) : e.codes, warnings: [] });
        } else throw new Error(e instanceof HouseraError ? e.message : "Validarea Housera nu a putut fi făcută.");
      }
    }
    return results;
  });

/** SuperAdmin → Portaluri → Housera: mediul activ și lista „Pregătire producție” (fără apeluri către Housera). */
export const getHouseraReadiness = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }) => {
    const { data: sa } = await (context as unknown as Ctx).supabase.rpc("is_superadmin");
    if (sa !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const { houseraConfigured, houseraEnv, HOUSERA_CALLBACK } = await import("./housera/config");
    const { houseraReadiness, reconcileHouseraEnvironment } = await import("./housera/environment");
    const { loadHouseraSchema } = await import("./housera/taxonomy.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const env = houseraEnv(process.env);
    await reconcileHouseraEnvironment(supabaseAdmin, env);
    const { data: conns } = await supabaseAdmin.from("portal_connections").select("status, settings, portal_credentials_encrypted").eq("portal", "housera");
    const schema = await loadHouseraSchema(process.env).catch(() => null);
    // Receptorul nostru (GET de sănătate), nu un apel către Housera.
    let webhookResponds: boolean | null = null;
    try {
      const url = HOUSERA_CALLBACK.replace(/oauth\/callback$/, "webhook");
      const r = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
      webhookResponds = r.ok;
    } catch { webhookResponds = false; }
    return houseraReadiness({
      env,
      clientKeys: houseraConfigured(process.env),
      webhookSecret: Boolean(process.env["HOUSERA_WEBHOOK_SECRET"]?.trim()),
      webhookResponds,
      schemaEnv: schema ? (schema.env === "production" ? "production" : "staging") : null,
      connections: ((conns ?? []) as Array<{ status: string | null; settings: Record<string, unknown> | null; portal_credentials_encrypted: string | null }>)
        .map((c) => ({ status: c.status, settings: c.settings, hasKey: !!c.portal_credentials_encrypted })),
    });
  });
