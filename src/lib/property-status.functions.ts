/**
 * Schimbarea statusului proprietății (pagina proprietății și acțiunea în masă).
 * Statusul se salvează imediat; pentru „Vândut” / „Închiriat” / „Arhivat”
 * retragerile de pe portaluri se pun în coadă și rulează în fundal.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

const STATUSES = [
  "draft",
  "active",
  "reserved",
  "negotiation",
  "sold",
  "rented",
  "expired",
  "archived",
] as const;

const inputSchema = z.object({
  propertyIds: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(STATUSES),
});

type Ctx = { userId: string; supabase: import("@supabase/supabase-js").SupabaseClient };

/** Proprietățile pe care utilizatorul le poate vedea (RLS), cu agenția lor. */
async function readVisible(context: Ctx, ids: string[]) {
  const { data, error } = await context.supabase
    .from("properties")
    .select("id, organization_id, status")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; organization_id: string; status: string }[];
}

export const previewPropertyStatusWithdrawals = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { withdrawReasonForStatus, planStatusWithdrawals } = await import(
      "@/lib/portals/status-withdraw.server"
    );
    if (!withdrawReasonForStatus(data.status)) return { automatic: [], manual: [] };
    const rows = await readVisible(context as unknown as Ctx, data.propertyIds);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const byOrg = new Map<string, string[]>();
    for (const r of rows) byOrg.set(r.organization_id, [...(byOrg.get(r.organization_id) ?? []), r.id]);
    const plan = (
      await Promise.all(
        [...byOrg].map(([org, ids]) => planStatusWithdrawals(supabaseAdmin as never, org, ids)),
      )
    ).flat();
    const group = (manual: boolean) => {
      const counts = new Map<string, { portalId: string; portalName: string; count: number }>();
      for (const p of plan.filter((x) => x.manual === manual)) {
        const c = counts.get(p.portalId) ?? { portalId: p.portalId, portalName: p.portalName, count: 0 };
        c.count += 1;
        counts.set(p.portalId, c);
      }
      return [...counts.values()].sort((a, b) => a.portalName.localeCompare(b.portalName));
    };
    return { automatic: group(false), manual: group(true) };
  });

export const changePropertyStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const rows = await readVisible(ctx, data.propertyIds);
    if (rows.length === 0) throw new Error("Proprietățile nu au fost găsite.");
    const nowIso = new Date().toISOString();

    // Update-ul trece prin RLS-ul utilizatorului: agentul modifică doar ce are voie.
    for (const row of rows) {
      if (row.status === data.status) continue;
      const patch: Record<string, unknown> =
        data.status === "archived"
          ? {
              status: "archived",
              archived_at: nowIso,
              archived_by: ctx.userId,
              pre_archive_status: row.status,
            }
          : { status: data.status };
      const { error } = await ctx.supabase.from("properties").update(patch as never).eq("id", row.id);
      if (error) throw new Error(error.message);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withdrawReasonForStatus, enqueueStatusWithdrawals } = await import(
      "@/lib/portals/status-withdraw.server"
    );
    const { logOperation } = await import("@/lib/portals.functions");
    const { clearProperstarCache } = await import("@/lib/portals/properstar/cache");
    const reason = withdrawReasonForStatus(data.status);

    const byOrg = new Map<string, string[]>();
    for (const r of rows) {
      if (r.status === data.status) continue;
      byOrg.set(r.organization_id, [...(byOrg.get(r.organization_id) ?? []), r.id]);
    }

    let queued = 0;
    let manual = 0;
    let armed = true;
    for (const [organizationId, ids] of byOrg) {
      clearProperstarCache(organizationId);
      await supabaseAdmin.from("audit_logs").insert(
        ids.map((id) => ({
          organization_id: organizationId,
          actor_id: ctx.userId,
          action: data.status === "archived" ? "property_archived" : "property_status_changed",
          entity: "property",
          entity_id: id,
          new_values: { status: data.status } as never,
        })) as never,
      );
      if (!reason) continue;
      try {
        const out = await enqueueStatusWithdrawals(
          supabaseAdmin as never,
          { organizationId, propertyIds: ids, reason, actorId: ctx.userId },
          { logOperation: async (i) => void (await logOperation(i)) },
        );
        queued += out.queued.length;
        manual += out.manual.length;
        armed = armed && out.armed;
      } catch (e) {
        // Statusul rămâne salvat chiar dacă programarea retragerilor eșuează.
        console.error("status withdraw enqueue failed", e);
        armed = false;
      }
    }
    return { ok: true, updated: rows.length, queued, manual, armed };
  });

export type AutoWithdrawView = {
  portalId: string;
  status: "queued" | "running" | "done" | "failed" | "manual_required" | "cancelled";
  reason: "status_sold" | "status_rented" | "archived" | "deleted";
  attempts: number;
  lastError: string | null;
  message: string | null;
  createdAt: string;
  finishedAt: string | null;
};

/** Ultima retragere automată per portal, pentru fila Publicare. */
export const getPropertyAutoWithdrawals = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AutoWithdrawView[]> => {
    const ctx = context as unknown as Ctx;
    const { data: rows } = await ctx.supabase
      .from("portal_status_withdraw_items" as never)
      .select("portal_key, status, reason, attempts, last_error, message, created_at, finished_at")
      .eq("property_id", data.propertyId)
      .order("created_at", { ascending: false })
      .limit(100);
    const seen = new Set<string>();
    const out: AutoWithdrawView[] = [];
    for (const r of (rows ?? []) as Record<string, unknown>[]) {
      const key = String(r["portal_key"]);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        portalId: key,
        status: r["status"] as AutoWithdrawView["status"],
        reason: r["reason"] as AutoWithdrawView["reason"],
        attempts: Number(r["attempts"] ?? 0),
        lastError: (r["last_error"] as string | null) ?? null,
        message: (r["message"] as string | null) ?? null,
        createdAt: String(r["created_at"]),
        finishedAt: (r["finished_at"] as string | null) ?? null,
      });
    }
    return out;
  });
