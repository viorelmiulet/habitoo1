/**
 * Retragerea automată de pe portaluri când proprietatea devine „Vândut”,
 * „Închiriat” sau „Arhivat” (server-only).
 *
 * Statusul se salvează imediat; retragerile intră într-o coadă durabilă
 * (`portal_status_withdraw_items`), procesată de un worker cron armat la
 * punerea în coadă, cu reîncercări. Worker-ul folosește EXACT calea debifării
 * manuale (`applyPortalSelectionForOrg` → `performPortalWithdraw`). Nimic nu
 * se republică automat la revenirea în „Activ”.
 */
import { getPortalDefinition } from "@/lib/portals/registry";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type StatusWithdrawAdmin = {
  from: (table: string) => any;
  rpc: (name: string, params?: any) => any;
};

export type StatusWithdrawReason = "status_sold" | "status_rented" | "archived";

export const STATUS_WITHDRAW_REASON_LABEL: Record<StatusWithdrawReason, string> = {
  status_sold: "Vândut",
  status_rented: "Închiriat",
  archived: "Arhivat",
};

/** Statusurile proprietății care declanșează retragerea. */
export function withdrawReasonForStatus(status: string): StatusWithdrawReason | null {
  if (status === "sold") return "status_sold";
  if (status === "rented") return "status_rented";
  if (status === "archived") return "archived";
  return null;
}

/** Statusul proprietății care corespunde motivului (pentru anulare la revenire). */
const STATUS_FOR_REASON: Record<StatusWithdrawReason, string[]> = {
  status_sold: ["sold", "archived"],
  status_rented: ["rented", "archived"],
  archived: ["archived", "sold", "rented"],
};

export const MANUAL_WITHDRAW_TEXT = "trebuie retras manual din contul portalului";

/** Portal cu publicare, dar fără retragere în API (ex. OferteImobiliare). */
export function isManualWithdrawPortal(portalKey: string): boolean {
  const def = getPortalDefinition(portalKey);
  if (!def) return false;
  return (
    def.capabilities.includes("publish_listing") &&
    !def.capabilities.includes("withdraw_listing") &&
    // Portalurile cu feed (ex. HomePitch) retrag prin dispariția din feed.
    !def.capabilities.includes("feed_pull")
  );
}

/** Pauzele dintre încercări: 1, 5, 15, 60 minute. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export type PlannedWithdrawal = {
  propertyId: string;
  portalId: string;
  portalName: string;
  manual: boolean;
};

/** Ce s-ar retrage: portalurile cu publicare activă (bifă activă). */
export async function planStatusWithdrawals(
  admin: StatusWithdrawAdmin,
  organizationId: string,
  propertyIds: string[],
): Promise<PlannedWithdrawal[]> {
  if (propertyIds.length === 0) return [];
  const { data, error } = await admin
    .from("portal_publications")
    .select("property_id, portal_key")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .in("property_id", propertyIds);
  if (error) throw new Error(error.message);
  const out: PlannedWithdrawal[] = [];
  for (const row of (data ?? []) as { property_id: string; portal_key: string }[]) {
    const def = getPortalDefinition(row.portal_key);
    if (!def) continue;
    out.push({
      propertyId: row.property_id,
      portalId: def.id,
      portalName: def.display_name,
      manual: isManualWithdrawPortal(def.id),
    });
  }
  return out.sort((a, b) =>
    a.propertyId === b.propertyId
      ? a.portalName.localeCompare(b.portalName)
      : a.propertyId.localeCompare(b.propertyId),
  );
}

export type EnqueueDeps = {
  /** Jurnalul de operații al portalului (`portal_operation_logs`). */
  logOperation: (input: {
    organizationId: string;
    portal: string;
    operation: string;
    success: boolean;
    errorMessage?: string | null;
    propertyId?: string | null;
    actorId?: string | null;
  }) => Promise<void>;
};

/**
 * Pune în coadă retragerile. Portalurile fără retragere în API se marchează
 * imediat „retragere manuală”, fără niciun apel, iar selecția devine inactivă.
 */
export async function enqueueStatusWithdrawals(
  admin: StatusWithdrawAdmin,
  input: {
    organizationId: string;
    propertyIds: string[];
    reason: StatusWithdrawReason;
    actorId: string | null;
  },
  deps: EnqueueDeps,
): Promise<{ queued: PlannedWithdrawal[]; manual: PlannedWithdrawal[]; armed: boolean }> {
  const plan = await planStatusWithdrawals(admin, input.organizationId, input.propertyIds);
  const queued: PlannedWithdrawal[] = [];
  const manual: PlannedWithdrawal[] = [];
  const nowIso = new Date().toISOString();

  for (const item of plan) {
    if (item.manual) {
      await admin
        .from("portal_publications")
        .update({
          enabled: false,
          status: "disabled",
          withdrawn_at: nowIso,
          withdraw_reason: input.reason,
          updated_by: input.actorId,
        })
        .eq("organization_id", input.organizationId)
        .eq("property_id", item.propertyId)
        .eq("portal_key", item.portalId);
      await admin.from("portal_status_withdraw_items").insert({
        organization_id: input.organizationId,
        property_id: item.propertyId,
        portal_key: item.portalId,
        reason: input.reason,
        status: "manual_required",
        message: `${item.portalName}: ${MANUAL_WITHDRAW_TEXT}.`,
        requested_by: input.actorId,
        finished_at: nowIso,
      });
      await deps.logOperation({
        organizationId: input.organizationId,
        portal: item.portalId,
        operation: "auto_withdraw_manual_required",
        success: false,
        errorMessage: `Motiv: ${input.reason}. ${MANUAL_WITHDRAW_TEXT}.`,
        propertyId: item.propertyId,
        actorId: input.actorId,
      });
      await admin.from("audit_logs").insert({
        organization_id: input.organizationId,
        actor_id: input.actorId,
        action: "portal_auto_withdraw_manual_required",
        entity: "property",
        entity_id: item.propertyId,
        new_values: { portal: item.portalId, reason: input.reason },
      });
      manual.push(item);
      continue;
    }

    // O retragere deja în curs pentru aceeași pereche nu se dublează.
    const { data: existing } = await admin
      .from("portal_status_withdraw_items")
      .select("id")
      .eq("property_id", item.propertyId)
      .eq("portal_key", item.portalId)
      .in("status", ["queued", "running"])
      .limit(1);
    if (existing && existing.length > 0) {
      queued.push(item);
      continue;
    }
    const { error } = await admin.from("portal_status_withdraw_items").insert({
      organization_id: input.organizationId,
      property_id: item.propertyId,
      portal_key: item.portalId,
      reason: input.reason,
      status: "queued",
      requested_by: input.actorId,
    });
    if (error) throw new Error(error.message);
    await admin.from("audit_logs").insert({
      organization_id: input.organizationId,
      actor_id: input.actorId,
      action: "portal_auto_withdraw_queued",
      entity: "property",
      entity_id: item.propertyId,
      new_values: { portal: item.portalId, reason: input.reason },
    });
    queued.push(item);
  }

  let armed = queued.length === 0;
  if (queued.length > 0) {
    const { error } = await admin.rpc("portal_status_withdraw_arm");
    armed = !error;
  }
  return { queued, manual, armed };
}

/* -------------------------------- worker -------------------------------- */

export type WithdrawOutcome = { ok: boolean; manual?: boolean; message: string };

export type ProcessDeps = {
  /**
   * Retragerea pe calea debifării: `applyPortalSelectionForOrg` cu
   * `enabled:false`, iar dacă bifa era deja inactivă (reîncercare),
   * `performPortalWithdraw` direct — aceeași funcție pe care o apelează debifarea.
   */
  withdraw: (input: {
    organizationId: string;
    propertyId: string;
    portalId: string;
    actorId: string | null;
    reason: StatusWithdrawReason;
  }) => Promise<WithdrawOutcome>;
  notify: (input: {
    organizationId: string;
    userId: string;
    title: string;
    body: string;
    link: string;
  }) => Promise<void>;
  now?: () => number;
};

type ItemRow = {
  id: string;
  organization_id: string;
  property_id: string;
  portal_key: string;
  reason: StatusWithdrawReason;
  attempts: number;
  max_attempts: number;
  requested_by: string | null;
};

/** Procesează o singură pereche (proprietate, portal). Eșecurile nu le blochează pe celelalte. */
export async function processStatusWithdrawItem(
  admin: StatusWithdrawAdmin,
  itemId: string,
  deps: ProcessDeps,
): Promise<{ status: string; message: string | null }> {
  const now = deps.now ?? Date.now;
  const { data: claimed } = await admin.rpc("claim_portal_status_withdraw_item", {
    _item_id: itemId,
    _ttl_seconds: 120,
  });
  const item = (Array.isArray(claimed) ? claimed[0] : claimed) as ItemRow | undefined;
  if (!item) return { status: "skipped", message: null };

  const { data: property } = await admin
    .from("properties")
    .select("id, status, assigned_to, reference, title")
    .eq("id", item.property_id)
    .maybeSingle();

  // Proprietatea a revenit în „Activ” înainte de retragere: nu mai retragem.
  if (!property || !STATUS_FOR_REASON[item.reason].includes(String(property.status))) {
    await admin
      .from("portal_status_withdraw_items")
      .update({
        status: "cancelled",
        locked_until: null,
        finished_at: new Date(now()).toISOString(),
        message: "Anulată: proprietatea și-a schimbat statusul înainte de retragere.",
      })
      .eq("id", item.id);
    return { status: "cancelled", message: null };
  }

  let outcome: WithdrawOutcome;
  try {
    outcome = await deps.withdraw({
      organizationId: item.organization_id,
      propertyId: item.property_id,
      portalId: item.portal_key,
      actorId: item.requested_by,
      reason: item.reason,
    });
  } catch (error) {
    outcome = { ok: false, message: error instanceof Error ? error.message : "Eroare necunoscută." };
  }

  const attempts = item.attempts + 1;
  const nowIso = new Date(now()).toISOString();
  const audit = (action: string, extra: Record<string, unknown>) =>
    admin.from("audit_logs").insert({
      organization_id: item.organization_id,
      actor_id: item.requested_by,
      action,
      entity: "property",
      entity_id: item.property_id,
      new_values: { portal: item.portal_key, reason: item.reason, attempts, ...extra },
    });

  if (outcome.ok || outcome.manual) {
    const status = outcome.ok ? "done" : "manual_required";
    await admin
      .from("portal_status_withdraw_items")
      .update({
        status,
        attempts,
        locked_until: null,
        last_error: null,
        message: outcome.message,
        finished_at: nowIso,
      })
      .eq("id", item.id);
    await audit(
      outcome.ok ? "portal_auto_withdraw_succeeded" : "portal_auto_withdraw_manual_required",
      { message: outcome.message },
    );
    return { status, message: outcome.message };
  }

  if (attempts < item.max_attempts) {
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]!;
    await admin
      .from("portal_status_withdraw_items")
      .update({
        status: "queued",
        attempts,
        locked_until: null,
        last_error: outcome.message,
        next_attempt_at: new Date(now() + delay).toISOString(),
      })
      .eq("id", item.id);
    return { status: "queued", message: outcome.message };
  }

  await admin
    .from("portal_status_withdraw_items")
    .update({
      status: "failed",
      attempts,
      locked_until: null,
      last_error: outcome.message,
      finished_at: nowIso,
    })
    .eq("id", item.id);
  await audit("portal_auto_withdraw_failed", { error: outcome.message });

  // Notificare: agentul responsabil sau, dacă nu există, cel care a schimbat statusul.
  const recipient = (property.assigned_to as string | null) ?? item.requested_by;
  if (recipient) {
    const def = getPortalDefinition(item.portal_key);
    const label = property.reference ?? property.title ?? "Proprietate";
    await deps.notify({
      organizationId: item.organization_id,
      userId: recipient,
      title: `Retragere eșuată de pe ${def?.display_name ?? item.portal_key}: ${label}`,
      body: `După ${attempts} încercări: ${outcome.message} Retrage manual oferta din fila Publicare.`,
      link: `/app/properties/${item.property_id}`,
    });
  }
  return { status: "failed", message: outcome.message };
}

/** Rulează worker-ul pe elementele scadente. */
export async function runStatusWithdrawTick(
  admin: StatusWithdrawAdmin,
  deps: ProcessDeps,
  opts: { maxItems: number; budgetMs: number },
) {
  const started = Date.now();
  const nowIso = new Date((deps.now ?? Date.now)()).toISOString();
  const { data: items } = await admin
    .from("portal_status_withdraw_items")
    .select("id")
    .in("status", ["queued", "running"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(opts.maxItems);
  const results: { id: string; status: string }[] = [];
  for (const row of (items ?? []) as { id: string }[]) {
    if (Date.now() - started > opts.budgetMs) break;
    const out = await processStatusWithdrawItem(admin, row.id, deps);
    results.push({ id: row.id, status: out.status });
  }
  return results;
}

/** Dependențele reale: calea debifării și notificările aplicației. */
export async function realProcessDeps(admin: StatusWithdrawAdmin): Promise<ProcessDeps> {
  const { applyPortalSelectionForOrg, performPortalWithdraw } = await import(
    "@/lib/portals.functions"
  );
  return {
    withdraw: async ({ organizationId, propertyId, portalId, actorId, reason }) => {
      const res = await applyPortalSelectionForOrg({
        organizationId,
        superadmin: true,
        actorId: actorId ?? (null as unknown as string),
        data: { propertyId, selections: [{ portalId, enabled: false }], syncExisting: false },
        withdrawReason: reason,
      });
      const r = res.results.find((x) => x.portalId === portalId);
      if (r) return { ok: r.ok, message: r.message ?? "" };
      // Bifa era deja inactivă (reîncercare): aceeași retragere, direct.
      const w = await performPortalWithdraw({
        organizationId,
        actorId,
        portalId,
        propertyId,
        withdrawReason: reason,
      });
      return { ok: w.ok, manual: w.manual, message: w.message };
    },
    notify: async (n) => {
      await admin.from("notifications").insert({
        organization_id: n.organizationId,
        user_id: n.userId,
        type: "portal_withdraw_failed",
        title: n.title,
        body: n.body,
        link: n.link,
      });
    },
  };
}
