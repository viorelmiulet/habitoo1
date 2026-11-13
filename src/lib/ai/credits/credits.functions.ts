/**
 * Server functions pentru creditele AI. Citirea propriului consum: orice membru
 * al agenției. Setările (credite pe plan, costuri, bonus) și consumul tuturor
 * agențiilor: doar superadmin, cu audit.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AI_CREDIT_ACTIONS,
  AI_CREDIT_PLANS,
  DEFAULT_AI_CREDIT_COSTS,
  DEFAULT_AI_PLAN_CREDITS,
  type AiCreditAction,
  type AiCreditPlan,
  type AiCreditUsage,
} from "./credits";

async function assertSuperadmin(context: { supabase: unknown; userId: string }) {
  const supabase = context.supabase as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
  };
  const { data } = await supabase.rpc("has_role", { _user_id: context.userId, _role: "superadmin" });
  if (data !== true) throw new Error("Doar administratorul platformei poate schimba creditele AI.");
}

/** Creditele AI ale agenției utilizatorului, luna curentă. */
export const getMyAiCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiCreditUsage | null> => {
    const { data, error } = await context.supabase.rpc("ai_credit_usage", {});
    if (error) return null;
    return data as unknown as AiCreditUsage;
  });

export type AiCreditSettings = {
  plans: Record<AiCreditPlan, number>;
  costs: Record<AiCreditAction, number>;
};

export const getAiCreditSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiCreditSettings> => {
    await assertSuperadmin(context);
    const [{ data: plans }, { data: costs }] = await Promise.all([
      context.supabase.from("ai_credit_plans").select("plan,monthly_credits"),
      context.supabase.from("ai_credit_costs").select("action,credits"),
    ]);
    const out: AiCreditSettings = { plans: { ...DEFAULT_AI_PLAN_CREDITS }, costs: { ...DEFAULT_AI_CREDIT_COSTS } };
    for (const row of plans ?? []) if ((AI_CREDIT_PLANS as readonly string[]).includes(row.plan)) out.plans[row.plan as AiCreditPlan] = row.monthly_credits;
    for (const row of costs ?? []) if ((AI_CREDIT_ACTIONS as readonly string[]).includes(row.action)) out.costs[row.action as AiCreditAction] = row.credits;
    return out;
  });

const credit = z.number().int().min(0).max(1_000_000);
const settingsSchema = z.object({
  plans: z.object(Object.fromEntries(AI_CREDIT_PLANS.map((p) => [p, credit])) as Record<AiCreditPlan, typeof credit>),
  costs: z.object(Object.fromEntries(AI_CREDIT_ACTIONS.map((a) => [a, credit])) as Record<AiCreditAction, typeof credit>),
});

export const saveAiCreditSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const now = new Date().toISOString();
    const { error: planError } = await context.supabase.from("ai_credit_plans").upsert(
      AI_CREDIT_PLANS.map((plan) => ({ plan, monthly_credits: data.plans[plan], updated_at: now, updated_by: context.userId })),
      { onConflict: "plan" },
    );
    if (planError) throw new Error("Creditele pe plan nu au putut fi salvate.");
    const { error: costError } = await context.supabase.from("ai_credit_costs").upsert(
      AI_CREDIT_ACTIONS.map((action) => ({ action, credits: data.costs[action], updated_at: now, updated_by: context.userId })),
      { onConflict: "action" },
    );
    if (costError) throw new Error("Costurile în credite nu au putut fi salvate.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "platform.ai_credit_settings_changed",
      entity: "ai_credit_plans",
      new_values: data,
    } as never);
    return { ok: true as const };
  });

export type AiCreditUsageRow = {
  organizationId: string;
  organizationName: string;
  plan: string;
  bonus: number;
  used: number;
  limit: number;
};

export const listAiCreditUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiCreditUsageRow[]> => {
    await assertSuperadmin(context);
    const { data, error } = await context.supabase.rpc("ai_credit_usage_all");
    if (error) throw new Error("Consumul de credite AI nu a putut fi citit.");
    return (data ?? []).map((row) => ({
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      plan: row.plan,
      bonus: row.bonus,
      used: row.used,
      limit: row.credit_limit,
    }));
  });

export const getOrganizationAiCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AiCreditUsage> => {
    await assertSuperadmin(context);
    const { data: usage, error } = await context.supabase.rpc("ai_credit_usage", { p_org: data.organizationId });
    if (error) throw new Error("Creditele AI ale agenției nu au putut fi citite.");
    return usage as unknown as AiCreditUsage;
  });

export const setOrganizationBonusCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid(), bonus: credit }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { data: before, error: readError } = await context.supabase.from("organizations").select("ai_bonus_credits").eq("id", data.organizationId).single();
    if (readError) throw new Error("Agenția nu a fost găsită.");
    const { error } = await context.supabase.from("organizations").update({ ai_bonus_credits: data.bonus }).eq("id", data.organizationId);
    if (error) throw new Error("Creditele bonus nu au putut fi salvate.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      organization_id: data.organizationId,
      actor_id: context.userId,
      action: "organization.ai_bonus_credits_changed",
      entity: "organizations",
      entity_id: data.organizationId,
      old_values: before,
      new_values: { ai_bonus_credits: data.bonus },
    } as never);
    return { ok: true as const };
  });
