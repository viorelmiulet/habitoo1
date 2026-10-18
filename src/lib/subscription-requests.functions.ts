import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNoActiveImpersonation } from "@/lib/impersonation.functions";
import { subscriptionChoiceSchema, subscriptionResolutionSchema } from "@/lib/subscription-requests";
const summarySchema = z.object({ organizationId: z.string(), organizationName: z.string(), plan: z.string(), activeAgents: z.number(), status: z.string() });
export const getSubscriptionChoices = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("subscription_request_summary");
  if (error) throw new Error(error.message);
  const summary = summarySchema.parse(data);
  const { data: requests, error: requestError } = await context.supabase.from("subscription_requests").select("*").eq("organization_id", summary.organizationId).order("requested_at", { ascending: false }).limit(30);
  if (requestError) throw new Error(requestError.message);
  return { ...summary, requests: requests ?? [] };
});
export const submitSubscriptionRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => subscriptionChoiceSchema.parse(input)).handler(async ({ data, context }) => {
  await assertNoActiveImpersonation(context.userId);
  const { data: id, error } = await context.supabase.rpc("submit_subscription_request", { _plan: data.plan, _term: data.term, _note: data.note ?? "", _replace: data.replace ?? undefined });
  if (error) throw new Error(error.code === "23505" ? "Există deja o cerere în așteptare. O poți schimba sau anula." : error.message);
  return { id };
});
export const cancelSubscriptionRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input)).handler(async ({ data, context }) => {
  await assertNoActiveImpersonation(context.userId);
  const { error } = await context.supabase.rpc("cancel_subscription_request", { _request: data.requestId });
  if (error) throw new Error(error.message);
  return { ok: true };
});
export const listSubscriptionRequests = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: allowed, error: roleError } = await context.supabase.rpc("is_superadmin");
  if (roleError || !allowed) throw new Error("Acces rezervat superadminului.");
  const { data, error } = await context.supabase.from("subscription_requests").select("*, organizations(name)").order("requested_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const ids = [...new Set((data ?? []).map(r => r.requested_by))];
  const profiles = ids.length ? await context.supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [], error: null };
  if (profiles.error) throw new Error(profiles.error.message);
  const names = new Map((profiles.data ?? []).map(p => [p.id, p.full_name]));
  return (data ?? []).map(r => ({ ...r, organizationName: r.organizations?.name ?? "Agenție", requestedByName: names.get(r.requested_by) ?? "Administrator agenție" }));
});
export const resolveSubscriptionRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => subscriptionResolutionSchema.parse(input)).handler(async ({ data, context }) => {
  await assertNoActiveImpersonation(context.userId);
  const { error } = await context.supabase.rpc("resolve_subscription_request", { _request: data.requestId, _status: data.status, _starts: data.starts, _expires: data.expires, _reason: data.reason });
  if (error) throw new Error(error.message);
  return { ok: true };
});
