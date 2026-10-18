import { Suspense } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/AppShell";
import { agencyNavFor } from "@/components/app/AppSidebar";
import { SubscriptionChoiceView } from "@/components/app/SubscriptionChoiceView";
import { ShellLoading } from "@/components/app/LoadingState";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { useCurrentUser } from "@/hooks/use-session";
import { canChooseSubscription, subscriptionRequestHead } from "@/lib/subscription-requests";
import { getSubscriptionChoices, submitSubscriptionRequest, cancelSubscriptionRequest } from "@/lib/subscription-requests.functions";
import { ArrowLeft } from "lucide-react";
const choicesOptions = () => queryOptions({ queryKey: ["subscription-choices"], queryFn: () => getSubscriptionChoices(), staleTime: 15_000 });
export const Route = createFileRoute("/_authenticated/abonament")({
  head: () => subscriptionRequestHead("Alege abonamentul — Habitoo CRM", "Alegerea planului Basic, Pro sau Unlimited și cererea de activare a abonamentului agenției."),
  component: SubscriptionPage,
});
function SubscriptionPage() {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <ShellLoading />;
  if (!user) return <Navigate to="/login" />;
  if (!canChooseSubscription(user)) return <Navigate to={user.isSuperadmin ? "/superadmin" : "/app"} />;
  return <AppShell user={user} groups={user.orgBlocked ? [{ items: [{ label: "Alege abonamentul", to: "/abonament", icon: ArrowLeft }] }] : agencyNavFor(true)} variant="agency"><div className="mx-auto max-w-5xl">{!user.orgBlocked ? <Button asChild variant="ghost" className="mb-5"><Link to="/app"><ArrowLeft />Înapoi în aplicație</Link></Button> : null}<Suspense fallback={<ShellLoading label="Se încarcă abonamentele…" />}><SubscriptionContent /></Suspense></div></AppShell>;
}
function SubscriptionContent() {
  const { data } = useSuspenseQuery(choicesOptions());
  const qc = useQueryClient();
  const submit = useServerFn(submitSubscriptionRequest);
  const cancel = useServerFn(cancelSubscriptionRequest);
  const mutation = useMutation({ mutationFn: (input: Parameters<typeof submit>[0]) => submit(input), onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["subscription-choices"] }), qc.invalidateQueries({ queryKey: ["subscription-pending"] }), qc.invalidateQueries({ queryKey: ["notifications"] })]); toast.success("Cererea a fost trimisă către administratorul platformei."); }, onError: e => toastError(e) });
  const cancellation = useMutation({ mutationFn: (id: string) => cancel({ data: { requestId: id } }), onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["subscription-choices"] }), qc.invalidateQueries({ queryKey: ["subscription-pending"] })]); toast.success("Cererea a fost anulată."); }, onError: e => toastError(e) });
  return <SubscriptionChoiceView key={data.requests.find(r => r.status === "pending")?.id ?? data.requests[0]?.id ?? "empty"} data={data} saving={mutation.isPending || cancellation.isPending} onSubmit={choice => mutation.mutate({ data: choice })} onCancel={id => cancellation.mutate(id)} />;
}
