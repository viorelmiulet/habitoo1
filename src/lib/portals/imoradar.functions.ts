/**
 * imoradar24 automat: setarea agenției (doar agency admin), alegerea pe anunț
 * (agentul pe anunțurile lui) și acțiunea unică în fundal pe coada existentă.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPortalPropertyAccess, resolvePublishingOrg, type AuthContext } from "@/lib/portals.functions";
import { requireSlotAdminOrg } from "@/lib/portals/slots.server";
import { IMOBILIARE_PORTAL_KEY } from "@/lib/portals/imobiliare/config";
import {
  AUTO_IMORADAR_SETTING_KEY,
  IMORADAR_BACKFILL_SPACING_MS,
  IMORADAR_PROMOTION_ID,
  IMORADAR_SKIP_MESSAGE,
  imoradarCheckboxDefault,
  readAutoImoradarSetting,
  selectImoradarBackfill,
} from "@/lib/portals/imobiliare/imoradar-auto";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const propertySchema = z.object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() });

async function propertyOrg(context: unknown, data: z.infer<typeof propertySchema>) {
  const org = await resolvePublishingOrg(context as AuthContext, data.organizationId);
  await assertPortalPropertyAccess({
    organizationId: org.organizationId, propertyId: data.propertyId,
    agentOnly: org.agentOnly, userId: (context as { userId: string }).userId,
  });
  return org.organizationId;
}

export const getImoradarPreference = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => propertySchema.parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await propertyOrg(context, data);
    const { loadImoradarContext } = await import("@/lib/portals/imobiliare/imoradar-auto.server");
    const ctx = await loadImoradarContext(await loadAdmin(), organizationId, data.propertyId);
    return {
      settingOn: ctx.settingOn,
      checked: imoradarCheckboxDefault(ctx.settingOn, ctx.optOut),
      manuallyStopped: ctx.state?.manuallyStopped === true,
      active: ctx.state?.value === true,
    };
  });

export const setImoradarOptOut = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => propertySchema.extend({ optOut: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await propertyOrg(context, data);
    const admin = await loadAdmin();
    const userId = (context as { userId: string }).userId;
    const { data: row } = await admin.from("portal_publications").select("id")
      .eq("organization_id", organizationId).eq("property_id", data.propertyId).eq("portal_key", IMOBILIARE_PORTAL_KEY).maybeSingle();
    const { error } = row
      ? await admin.from("portal_publications").update({ imoradar_opt_out: data.optOut, updated_by: userId }).eq("id", row.id)
      : await admin.from("portal_publications").insert({
          organization_id: organizationId, property_id: data.propertyId, portal_key: IMOBILIARE_PORTAL_KEY,
          enabled: false, imoradar_opt_out: data.optOut, created_by: userId, updated_by: userId,
        });
    if (error) throw new Error("Alegerea imoradar24 nu a putut fi salvată.");
    return { ok: true };
  });

const orgSchema = z.object({ organizationId: z.string().uuid().optional() });

async function activeBatch(admin: Awaited<ReturnType<typeof loadAdmin>>, organizationId: string) {
  const { data } = await admin.from("portal_republish_batches").select("id, kind")
    .eq("organization_id", organizationId).eq("status", "running").maybeSingle();
  return data ?? null;
}

export const getAutoImoradarSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgSchema.parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const admin = await loadAdmin();
    const { data: connection } = await admin.from("portal_connections").select("settings, activated")
      .eq("organization_id", organizationId).eq("portal", IMOBILIARE_PORTAL_KEY).maybeSingle();
    const batch = await activeBatch(admin, organizationId);
    return {
      connected: !!connection && connection.activated === true,
      enabled: readAutoImoradarSetting(connection?.settings),
      activeBatchId: batch?.kind === "imoradar" ? batch.id : null,
      otherBatchRunning: !!batch && batch.kind !== "imoradar",
    };
  });

export const setAutoImoradarSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgSchema.extend({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const admin = await loadAdmin();
    const { data: connection } = await admin.from("portal_connections").select("id, settings")
      .eq("organization_id", organizationId).eq("portal", IMOBILIARE_PORTAL_KEY).maybeSingle();
    if (!connection) throw new Error("Imobiliare.ro nu este conectat pentru agenție.");
    const settings = { ...((connection.settings ?? {}) as Record<string, unknown>), [AUTO_IMORADAR_SETTING_KEY]: data.enabled };
    const userId = (context as unknown as { userId: string }).userId;
    const { error } = await admin.from("portal_connections").update({ settings: settings as never, updated_by: userId }).eq("id", connection.id);
    if (error) throw new Error("Setarea nu a putut fi salvată.");
    await admin.from("audit_logs").insert({
      organization_id: organizationId, actor_id: userId, action: "imoradar_auto_setting",
      entity: "portal_connection", entity_id: connection.id, new_values: { enabled: data.enabled },
    } as never).then(() => undefined, () => undefined);
    return { ok: true };
  });

export const startImoradarBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgSchema.parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const userId = (context as unknown as { userId: string }).userId;
    const admin = await loadAdmin();
    if (await activeBatch(admin, organizationId)) throw new Error("O acțiune în lot rulează deja pentru agenție. Așteaptă să se termine.");
    const [{ data: listings }, { data: states }, { data: pubs }, { data: props }] = await Promise.all([
      admin.from("portal_listings").select("property_id, status, external_id").eq("organization_id", organizationId).eq("portal", IMOBILIARE_PORTAL_KEY),
      admin.from("imobiliare_promotion_states").select("property_id, value_boolean, manually_stopped").eq("organization_id", organizationId).eq("promotion_id", IMORADAR_PROMOTION_ID),
      admin.from("portal_publications").select("property_id").eq("organization_id", organizationId).eq("portal_key", IMOBILIARE_PORTAL_KEY).eq("imoradar_opt_out", true),
      admin.from("properties").select("id").eq("organization_id", organizationId).is("deleted_at", null),
    ]);
    const live = new Set((props ?? []).map((p) => p.id));
    const selection = selectImoradarBackfill({
      listings: (listings ?? []).filter((l) => live.has(l.property_id)),
      states: (states ?? []) as never,
      optOuts: (pubs ?? []).map((p) => p.property_id),
    });
    if (selection.queued.length === 0 && selection.skipped.length === 0) throw new Error("Nu există anunțuri publicate pe Imobiliare.ro.");
    const skippedItems = selection.skipped.map((s) => ({ propertyId: s.propertyId, portalId: IMOBILIARE_PORTAL_KEY, message: IMORADAR_SKIP_MESSAGE[s.reason] }));
    const { data: batch, error } = await admin.from("portal_republish_batches").insert({
      organization_id: organizationId, requested_by: userId, scope: "all", kind: "imoradar",
      portal_keys: [IMOBILIARE_PORTAL_KEY], total: selection.queued.length + skippedItems.length,
      skipped: skippedItems.length, skipped_items: skippedItems,
    }).select("id").single();
    if (error || !batch) throw new Error("Acțiunea nu a putut fi pornită.");
    const now = Date.now();
    const busy: typeof skippedItems = [];
    for (const [i, propertyId] of selection.queued.entries()) {
      const { error: insertError } = await admin.from("portal_publish_jobs").insert({
        organization_id: organizationId, property_id: propertyId, portal_key: IMOBILIARE_PORTAL_KEY,
        enabled: true, promoted: null, sync_existing: false, requested_by: userId, superadmin: false,
        operation: "imoradar", republish_batch_id: batch.id,
        next_attempt_at: new Date(now + i * IMORADAR_BACKFILL_SPACING_MS).toISOString(),
      });
      if (insertError) busy.push({ propertyId, portalId: IMOBILIARE_PORTAL_KEY, message: "Anunțul se sincronizează deja; sărit." });
    }
    if (busy.length) {
      await admin.from("portal_republish_batches").update({ skipped: skippedItems.length + busy.length, skipped_items: [...skippedItems, ...busy] }).eq("id", batch.id);
    }
    if (selection.queued.length > busy.length) {
      const { error: armError } = await admin.rpc("portal_publish_arm");
      if (armError) console.error("[imoradar-backfill] armarea a eșuat", armError.message);
    } else {
      const { refreshRepublishBatches } = await import("@/lib/portals/republish.server");
      await refreshRepublishBatches(admin);
    }
    return { batchId: batch.id, queued: selection.queued.length - busy.length, skipped: skippedItems.length + busy.length };
  });
