/**
 * Starea unei oferte pe portaluri, direct din pagina proprietății.
 * Acțiunile sunt disponibile doar administratorului agenției (server-side).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { EmptyState } from "@/components/app/EmptyState";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { getPropertyPortalStatus, runPortalListingAction } from "@/lib/portals.functions";

const LISTING_LABEL: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  not_published: { label: "Netrimisă", tone: "neutral" },
  pending: { label: "În așteptare", tone: "warning" },
  published: { label: "Trimisă", tone: "success" },
  updated: { label: "Actualizată", tone: "success" },
  withdrawn: { label: "Retrasă", tone: "neutral" },
  error: { label: "Eroare", tone: "danger" },
};

export function PropertyPortalsCard({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const loadStatus = useServerFn(getPropertyPortalStatus);
  const runAction = useServerFn(runPortalListingAction);
  const queryKey = ["property-portals", propertyId] as const;

  const status = useQuery({ queryKey, queryFn: () => loadStatus({ data: { propertyId } }) });

  const act = useMutation({
    mutationFn: (input: { portalId: string; action: "publish" | "update" | "withdraw" }) =>
      runAction({ data: { portalId: input.portalId, propertyId, action: input.action } }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey });
      if (!res.ok) {
        toast.error(res.message);
      } else if (res.live) {
        toast.success(res.message ?? "Operațiunea a fost trimisă portalului.");
      } else {
        toast.message(res.message ?? "Verificat local. Trimiterile reale sunt oprite în Setări → Integrări.");
      }
    },
    onError: (e: Error) => toastError(e),
  });

  if (status.isLoading) return <InlineLoading label="Se încarcă starea pe portaluri…" />;
  if (status.isError) return <QueryError error={status.error} onRetry={() => status.refetch()} />;
  if ((status.data ?? []).length === 0) {
    return <EmptyState title="Nu există portaluri disponibile" />;
  }

  return (
    <div className="panel divide-y divide-border">
      {(status.data ?? []).map((item) => {
        const badge = LISTING_LABEL[item.status] ?? LISTING_LABEL["not_published"]!;
        const diag = item.diagnostics;
        return (
          <div key={item.portalId} className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.portalName}</p>
              <p className="text-xs text-muted-foreground">
                {item.connected ? "Conexiune configurată" : "Portal neconectat — configurează în Setări → Integrări"}
                {item.lastSyncAt ? ` · ultima operațiune ${formatDateTime(item.lastSyncAt)}` : ""}
              </p>
              {diag ? (
                <p className="text-xs text-muted-foreground">
                  {diag.feedVisible ? "Vizibilă în feed" : "Nu apare în feed"}
                  {` · ${diag.images.resolvable}/${diag.images.total} fotografii`}
                  {diag.images.total > 0 && !diag.images.primary ? " (fără principală)" : ""}
                  {` · agent ${diag.agentName ?? "neasignat"}`}
                  {item.externalId ? ` · referință ${item.externalId}` : ""}
                </p>
              ) : null}
              {diag?.notes.length ? (
                <p className="text-xs text-warning-foreground">{diag.notes.join(" ")}</p>
              ) : null}
              {item.lastError ? <p className="text-xs text-destructive">{item.lastError}</p> : null}
            </div>
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!item.connected || act.isPending}
                onClick={() => act.mutate({ portalId: item.portalId, action: "publish" })}
              >
                <Send className="mr-2 size-3.5" />
                Trimite
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!item.connected || act.isPending}
                onClick={() => act.mutate({ portalId: item.portalId, action: "update" })}
              >
                <RefreshCw className="mr-2 size-3.5" />
                Actualizează
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!item.connected || act.isPending}
                onClick={() => act.mutate({ portalId: item.portalId, action: "withdraw" })}
              >
                <Undo2 className="mr-2 size-3.5" />
                Retrage
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
