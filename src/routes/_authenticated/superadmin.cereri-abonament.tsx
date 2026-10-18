import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/app/PageHeader";
import { SubscriptionRequestsView } from "@/components/superadmin/SubscriptionRequestsView";
import { listSubscriptionRequests, resolveSubscriptionRequest } from "@/lib/subscription-requests.functions";
import { subscriptionRequestHead } from "@/lib/subscription-requests";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
const requestsOptions = () => queryOptions({ queryKey: ["superadmin", "subscription-requests"], queryFn: () => listSubscriptionRequests(), staleTime: 10_000 });
export const Route = createFileRoute("/_authenticated/superadmin/cereri-abonament")({
  head: () => subscriptionRequestHead("Cereri abonament — Habitoo SuperAdmin", "Verificarea cererilor agențiilor și activarea sau respingerea abonamentelor Habitoo CRM."),
  validateSearch: (search: Record<string, unknown>): { request?: string } => ({ request: typeof search.request === "string" ? search.request : undefined }),
  loader: ({ context }) => context.queryClient.ensureQueryData(requestsOptions()), component: RequestsPage,
});
function RequestsPage() {
  const { data } = useSuspenseQuery(requestsOptions());
  const { request } = Route.useSearch();
  const qc = useQueryClient();
  const resolve = useServerFn(resolveSubscriptionRequest);
  const mutation = useMutation({ mutationFn: (input: Parameters<typeof resolve>[0]) => resolve(input), onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["superadmin"] }), qc.invalidateQueries({ queryKey: ["notifications"] }), qc.invalidateQueries({ queryKey: ["current-user"] })]); toast.success("Cererea a fost rezolvată. Administratorii agenției au fost notificați."); }, onError: e => toastError(e) });
  return <><PageHeader title="Cereri abonament" /><SubscriptionRequestsView key={data.map(r => `${r.id}:${r.status}`).join(",")} rows={data} focused={request} saving={mutation.isPending} onResolve={v => mutation.mutate({ data: v })} /></>;
}
