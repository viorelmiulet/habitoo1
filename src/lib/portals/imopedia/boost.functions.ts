/**
 * Imopedia.ro: boost-ul unei oferte publicate. Aceleași permisiuni ca bifa „Promovat”
 * (acces la proprietate prin `assertPortalPropertyAccess`); fiecare boost se jurnalizează.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

const input = z.object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() });

/** Boost-uri disponibile per agenție, cache 5 minute (per worker). */
const BOOST_TTL_MS = 5 * 60_000;
const boostCache = new Map<string, { at: number; available: number | null }>();

async function resolve(context: unknown, data: z.infer<typeof input>) {
  const { resolvePublishingOrg, assertPortalPropertyAccess, buildContext } = await import("@/lib/portals.functions");
  const { getPortalDefinition } = await import("@/lib/portals/registry");
  const ctxAuth = context as { userId: string };
  const { organizationId, agentOnly } = await resolvePublishingOrg(context as never, data.organizationId);
  await assertPortalPropertyAccess({ organizationId, propertyId: data.propertyId, agentOnly, userId: ctxAuth.userId });
  const { ctx } = await buildContext(organizationId, getPortalDefinition("imopedia")!);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: listing } = await (supabaseAdmin as any)
    .from("portal_listings")
    .select("status, external_id")
    .eq("organization_id", organizationId)
    .eq("portal", "imopedia")
    .eq("property_id", data.propertyId)
    .maybeSingle();
  const published = listing && ["published", "updated"].includes(listing.status) && listing.external_id;
  return { organizationId, ctx, userId: ctxAuth.userId, idLocal: published ? Number(listing.external_id) : null };
}

export const getImopediaBoostInfo = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const r = await resolve(context, data);
    if (r.idLocal === null) return { published: false, available: null as number | null, error: null as string | null };
    const hit = boostCache.get(r.organizationId);
    if (hit && Date.now() - hit.at < BOOST_TTL_MS) return { published: true, available: hit.available, error: null };
    const { imopediaBoostAvailable } = await import("@/lib/portals/adapters/imopedia.server");
    const res = await imopediaBoostAvailable(r.ctx);
    if (!res.ok) return { published: true, available: null, error: res.message };
    boostCache.set(r.organizationId, { at: Date.now(), available: res.data.available });
    return { published: true, available: res.data.available, error: null };
  });

export const runImopediaBoost = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const r = await resolve(context, data);
    if (r.idLocal === null) return { ok: false, message: "Oferta nu este publicată pe Imopedia.ro." };
    const cached = boostCache.get(r.organizationId);
    if (cached && Date.now() - cached.at < BOOST_TTL_MS && cached.available === 0) {
      return { ok: false, message: "Agenția nu mai are boost-uri disponibile pe Imopedia.ro." };
    }
    const { imopediaSaveBoost } = await import("@/lib/portals/adapters/imopedia.server");
    const { logOperation } = await import("@/lib/portals.functions");
    const started = Date.now();
    const res = await imopediaSaveBoost(r.ctx, r.idLocal);
    await logOperation({
      organizationId: r.organizationId,
      portal: "imopedia",
      operation: "boost",
      success: res.ok,
      errorCode: res.ok ? null : res.code,
      errorMessage: res.ok ? null : res.message,
      propertyId: data.propertyId,
      actorId: r.userId,
      externalId: String(r.idLocal),
      portalResponse: res.ok ? res.data.portalResponse : res.portalResponse,
      durationMs: Date.now() - started,
    });
    boostCache.delete(r.organizationId);
    return res.ok
      ? { ok: true, message: "Oferta a urcat pe primul loc pe Imopedia.ro." }
      : { ok: false, message: res.message };
  });
