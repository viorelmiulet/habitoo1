import { mapPropertyToVrexa, type VrexaMapResult } from "./mapper";

/** SuperAdmin read-only preview; never imports the Vrexa client or credentials. */
export async function buildVrexaPreview(organizationId: string | null, propertyId: string): Promise<VrexaMapResult> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  let q = db.from("properties").select("*").eq("id", propertyId).is("deleted_at", null);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data: p, error } = await q.maybeSingle();
  if (error || !p) throw new Error("Proprietatea nu a putut fi citită.");
  const row = p as Record<string, any>;
  let agent: { name: string | null; email: string | null; phone: string | null } | null = null;
  if (row.assigned_to) {
    const { data: prof, error: pe } = await db.from("profiles").select("full_name, email, phone").eq("id", row.assigned_to).maybeSingle();
    if (pe) throw new Error("Agentul responsabil nu a putut fi citit.");
    if (prof) agent = { name: (prof as any).full_name ?? null, email: (prof as any).email ?? null, phone: (prof as any).phone ?? null };
  }
  const needsRate = [row.currency, row.sale_currency, row.rent_currency].some((c) => String(c ?? "").toUpperCase() === "RON");
  let eurRonRate: number | null | undefined;
  if (needsRate) {
    const { getRonEurRateForDate } = await import("@/lib/commissions-rates.server");
    eurRonRate = await getRonEurRateForDate(new Date().toISOString().slice(0, 10), { table: db.from("exchange_rates") as never })
      .then((r) => r.rate).catch(() => null);
  }
  return mapPropertyToVrexa(row as never, { agent, ...(needsRate ? { eurRonRate } : {}) });
}

export async function vrexaReasonsFor(organizationId: string, propertyId: string): Promise<string[]> {
  const r = await buildVrexaPreview(organizationId, propertyId);
  return r.ok ? [] : r.reasons;
}
