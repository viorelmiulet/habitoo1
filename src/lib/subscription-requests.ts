import { z } from "zod";
import { planAgentLimit, type PlanKey } from "@/lib/plans";
export const paidTermSchema = z.enum(["30d", "12m"]);
export type PaidTerm = z.infer<typeof paidTermSchema>;
export const subscriptionChoiceSchema = z.object({ plan: z.enum(["basic", "pro", "unlimited"]), term: paidTermSchema, note: z.string().trim().max(1000).optional(), replace: z.string().uuid().nullable().optional() });
export const subscriptionResolutionSchema = z.object({ requestId: z.string().uuid(), status: z.enum(["approved", "rejected"]), starts: z.string().datetime().optional(), expires: z.string().datetime().optional(), reason: z.string().trim().max(1000).optional() }).superRefine((v, ctx) => {
  if (v.status === "approved" && (!v.starts || !v.expires || Date.parse(v.expires) <= Date.parse(v.starts))) ctx.addIssue({ code: "custom", message: "Data expirării trebuie să fie după data de început." });
  if (v.status === "rejected" && !v.reason) ctx.addIssue({ code: "custom", message: "Completează motivul respingerii." });
});
export function canChooseSubscription(user: { isAdmin: boolean; isSuperadmin: boolean; impersonation?: unknown }) { return user.isAdmin && !user.isSuperadmin && !user.impersonation; }
export function subscriptionPlanFits(plan: PlanKey, agents: number) { const limit = planAgentLimit(plan); return limit === null || agents <= limit; }
export function paidTermLabel(term: string) { return term === "12m" ? "anual" : "lunar"; }
export function defaultSubscriptionDates(term: PaidTerm, start = new Date().toISOString().slice(0, 10)) {
  const date = new Date(`${start}T12:00:00Z`);
  if (term === "30d") date.setUTCDate(date.getUTCDate() + 30);
  else { const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCFullYear(date.getUTCFullYear() + 1); const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(day, end)); }
  return { start, expires: date.toISOString().slice(0, 10) };
}
export function subscriptionRequestHead(title: string, description: string) {
  return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] };
}
