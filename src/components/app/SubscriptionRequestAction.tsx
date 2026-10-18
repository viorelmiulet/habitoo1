import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { planLabel } from "@/lib/plans";
import { canChooseSubscription, paidTermLabel } from "@/lib/subscription-requests";
import type { CurrentUser } from "@/hooks/use-session";
export function SubscriptionRequestAction({ user }: { user: CurrentUser }) {
  const enabled = canChooseSubscription(user) && Boolean(user.profile?.organization_id);
  const { data: pending } = useQuery({ queryKey: ["subscription-pending", user.profile?.organization_id], enabled, queryFn: async () => {
    const org = user.profile?.organization_id;
    if (!org) return null;
    const { data, error } = await supabase.from("subscription_requests").select("plan,term").eq("organization_id", org).eq("status", "pending").maybeSingle();
    if (error) throw error;
    return data;
  }, refetchInterval: 30_000 });
  if (!enabled) return null;
  if (pending) return <Link to="/abonament" className="font-semibold underline underline-offset-4">Cerere trimisă: {planLabel(pending.plan)}, {paidTermLabel(pending.term)} · în așteptarea activării</Link>;
  return <Button asChild variant="outline" size="sm"><Link to="/abonament">Alege abonamentul</Link></Button>;
}
