import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { getHomezzPromotions, promoteHomezzListing, stopHomezzListingPromotion } from "@/lib/portals.functions";
import { HOMEZZ_PROMOTION_CONFIRM } from "@/lib/portals/homezz/promotions";

type Pending = { kind: "promote" | "stop"; internalId: string; promotionId: number; label: string };

/** Promovările HomeZZ ale anunțului publicat; fiecare acțiune cere confirmare și nu se reîncearcă automat. */
export function HomezzPromotionsPanel({ organizationId, propertyId }: { organizationId?: string | undefined; propertyId: string }) {
  const qc = useQueryClient();
  const key = ["homezz-promotions", organizationId, propertyId] as const;
  const load = useServerFn(getHomezzPromotions);
  const promoteFn = useServerFn(promoteHomezzListing);
  const stopFn = useServerFn(stopHomezzListingPromotion);
  const state = useQuery({
    queryKey: key,
    queryFn: () => load({ data: { ...(organizationId ? { organizationId } : {}), propertyId } }).catch(() => ({ offers: [] })),
    staleTime: 60 * 1000,
    retry: false,
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const run = useMutation({
    mutationFn: (p: Pending) => {
      const data = { ...(organizationId ? { organizationId } : {}), propertyId, internalId: p.internalId, promotionId: p.promotionId, confirmed: true as const };
      return p.kind === "promote" ? promoteFn({ data }) : stopFn({ data });
    },
    onSuccess: (r) => { (r.ok ? toast.success : toast.error)(r.message); setPending(null); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => { setPending(null); toastError(e); },
  });
  const offers = state.data?.offers ?? [];
  if (!offers.length) return null;
  return (
    <div className="mt-2 space-y-2" data-homezz-promotions>
      {offers.map((o) => (
        <div key={o.internalId} className="space-y-1.5 text-xs">
          <p className="text-muted-foreground">
            {offers.length > 1 ? (o.transaction === "rent" ? "Închiriere: " : "Vânzare: ") : null}
            {o.active
              ? `Promovare activă: ${o.active.label}${o.active.startDate || o.active.endDate ? ` (${o.active.startDate ?? "?"} – ${o.active.endDate ?? "?"})` : ""}`
              : "Fără promovare activă"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {o.buttons.map((b) => (
              <Button key={b.id} type="button" size="compact" variant="outline" disabled={!b.enabled || run.isPending}
                title={`${b.remaining} disponibile`}
                onClick={() => setPending({ kind: "promote", internalId: o.internalId, promotionId: b.id, label: b.label })}>
                {b.label}
              </Button>
            ))}
            {o.active ? (
              <Button type="button" size="compact" variant="ghost" disabled={run.isPending}
                onClick={() => setPending({ kind: "stop", internalId: o.internalId, promotionId: o.active!.promotionId, label: o.active!.label })}>
                Oprește promovarea
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      <Dialog open={pending !== null} onOpenChange={(v) => { if (!v && !run.isPending) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.kind === "stop" ? `Oprești promovarea ${pending.label}?` : `Aplici ${pending?.label ?? ""} pe HomeZZ?`}</DialogTitle>
            <DialogDescription>{pending?.kind === "stop" ? "Promovarea se oprește pe HomeZZ și redevine disponibilă în pachetul agenției." : HOMEZZ_PROMOTION_CONFIRM}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={run.isPending} onClick={() => setPending(null)}>Renunță</Button>
            <Button type="button" disabled={run.isPending} onClick={() => { if (pending) run.mutate(pending); }}>Confirmă</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
