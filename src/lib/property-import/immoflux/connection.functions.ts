import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNoActiveImpersonation } from "@/lib/impersonation.functions";
import { normalizeImmofluxHost, normalizeImmofluxSlug, testImmofluxPull, type ImmofluxConnectionView } from "./connection";

const agencyInput = z.object({ organizationId: z.string().uuid() });
const saveInput = agencyInput.extend({ host: z.string().max(253), slug: z.string().max(150), enabled: z.boolean(), apiKey: z.string().min(1).max(4096).optional() });
type Auth = { userId: string; supabase: { rpc: (name: "is_superadmin") => PromiseLike<{ data: boolean | null; error: unknown }> } };

async function authorize(context: Auth) {
  const role = await context.supabase.rpc("is_superadmin");
  if (role.error || role.data !== true) throw new Error("Acces refuzat: configurarea IMMOFLUX este permisă exclusiv SuperAdmin.");
  await assertNoActiveImpersonation(context.userId);
}

export const getImmofluxConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => agencyInput.parse(input))
  .handler(async ({ data, context }): Promise<ImmofluxConnectionView> => {
    await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.from("immoflux_connections").select("organization_id,host,slug,enabled").eq("organization_id", data.organizationId).maybeSingle();
    if (result.error) throw new Error("Configurarea IMMOFLUX nu poate fi citită.");
    return { organizationId: data.organizationId, host: result.data?.host ?? "", slug: result.data?.slug ?? "", enabled: result.data?.enabled ?? false, configured: Boolean(result.data) };
  });

export const saveImmofluxConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context);
    const host = normalizeImmofluxHost(data.host);
    const slug = normalizeImmofluxSlug(data.slug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptImmofluxKey } = await import("./connection.server");
    const key = data.apiKey ? encryptImmofluxKey(data.apiKey) : null;
    // Postgres accepts null to preserve a saved key; generated RPC types omit nullability.
    const { error } = await supabaseAdmin.rpc("save_immoflux_connection", { _organization_id: data.organizationId, _host: host, _slug: slug, _enabled: data.enabled, _actor: context.userId, _encrypted: key?.encrypted ?? null, _digest: key?.digest ?? null } as never);
    if (error) throw new Error(error.code === "23505" ? "Această configurare IMMOFLUX este deja folosită de altă agenție." : "Configurarea nu a putut fi salvată. La prima salvare, cheia API este obligatorie.");
    return { saved: true };
  });

export const testImmofluxConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => agencyInput.parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { unlockImmofluxKey } = await import("./connection.server");
    const config = await supabaseAdmin.from("immoflux_connections").select("host,slug,api_key_encrypted").eq("organization_id", data.organizationId).maybeSingle();
    let result: Awaited<ReturnType<typeof testImmofluxPull>>;
    if (config.error || !config.data) result = { ok: false, message: "Salvează mai întâi configurarea IMMOFLUX.", total: null, httpStatus: null };
    else {
      try { result = await testImmofluxPull(config.data.host, config.data.slug, unlockImmofluxKey(config.data.api_key_encrypted)); }
      catch { result = { ok: false, message: "Cheia salvată nu poate fi utilizată. Salvează din nou cheia API.", total: null, httpStatus: null }; }
    }
    const audit = await supabaseAdmin.from("audit_logs").insert({ organization_id: data.organizationId, actor_id: context.userId, created_by: context.userId, action: "immoflux.tested", entity: "immoflux_connections", entity_id: data.organizationId, new_values: { ok: result.ok, http_status: result.httpStatus, total: result.total } });
    if (audit.error) throw new Error("Testul nu a putut fi înregistrat în jurnal.");
    return result;
  });