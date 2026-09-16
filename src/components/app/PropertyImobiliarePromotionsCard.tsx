/**
 * PROMOVARE IMOBILIARE.RO — administrarea reală a serviciilor pe ofertă.
 *
 * Contoarele (folosite / total) vin LIVE de la portal la fiecare deschidere:
 * nu afișăm cifre din memorie ca fiind actuale. Serviciile fără locuri libere
 * nu pot fi activate, dar pot fi mereu dezactivate. „Puncte Energy” are câmp
 * numeric, nu bifă.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  getImobiliarePromotions,
  getImobiliareSlotListings,
  setImobiliarePromotion,
  type ImobiliarePromotionRow,
} from "@/lib/portals/imobiliare-promotions.functions";

function counter(row: ImobiliarePromotionRow): string {
  if (row.total === null || row.used === null) return "—";
  return `${row.used} / ${row.total}`;
}

export function PropertyImobiliarePromotionsCard({
  propertyId,
  organizationId,
  canManage,
}: {
  propertyId: string;
  organizationId?: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getImobiliarePromotions);
  const save = useServerFn(setImobiliarePromotion);
  const loadListings = useServerFn(getImobiliareSlotListings);
  const queryKey = ["property-imobiliare-promotions", organizationId, propertyId] as const;

  const view = useQuery({
    queryKey,
    queryFn: () => load({ data: { ...(organizationId ? { organizationId } : {}), propertyId } }),
  });

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [energyDraft, setEnergyDraft] = useState<Record<string, string>>({});
  const [openSlot, setOpenSlot] = useState<string | null>(null);

  const mutate = useMutation({
    mutationFn: (input: { promotionId: string; value: boolean | number }) =>
      save({
        data: { ...(organizationId ? { organizationId } : {}), propertyId, ...input },
      }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setPendingId(null),
  });

  const listings = useQuery({
    queryKey: ["property-imobiliare-slot-listings", organizationId, propertyId, openSlot] as const,
    enabled: openSlot !== null,
    queryFn: () =>
      loadListings({
        data: {
          ...(organizationId ? { organizationId } : {}),
          propertyId,
          promotionId: openSlot as string,
        },
      }),
  });

  const rows = useMemo(() => view.data?.promotions ?? [], [view.data]);

  if (view.isLoading) {
    return (
      <div className="mt-3 pl-9 text-xs text-muted-foreground">
        <Loader2 className="mr-1.5 inline size-3 animate-spin" aria-hidden />
        Se citesc locurile de promovare de la Imobiliare.ro…
      </div>
    );
  }

  if (view.isError) {
    return (
      <p className="mt-3 pl-9 text-xs text-destructive">
        Locurile de promovare nu au putut fi citite: {(view.error as Error).message}
      </p>
    );
  }

  if (!view.data?.available) {
    return (
      <p className="mt-3 pl-9 text-xs text-muted-foreground">
        {view.data?.message ?? "Promovarea Imobiliare.ro nu este disponibilă pentru această ofertă."}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 pl-3 sm:ml-9">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">Promovare Imobiliare.ro</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {view.data.syncedAt
              ? `Sincronizat ${formatDateTime(view.data.syncedAt)}`
              : "Nesincronizat"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={view.isFetching}
            onClick={() => void view.refetch()}
          >
            <RefreshCw className={cn("mr-1 size-3", view.isFetching && "animate-spin")} aria-hidden />
            Sincronizează
          </Button>
        </div>
      </header>

      {view.data.listingError ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          Starea serviciilor pentru acest anunț nu a putut fi citită: {view.data.listingError}
        </p>
      ) : null}

      <ul className="mt-2 divide-y divide-border/60">
        {rows.map((row) => {
          const active = row.value === true || (typeof row.value === "number" && row.value > 0);
          const noSlots = row.available !== null && row.available <= 0;
          const blocked = !row.manageable || (!active && noSlots) || row.error !== null;
          const busy = pendingId === row.id && mutate.isPending;
          const draft = energyDraft[row.id];
          const energyValue =
            draft !== undefined ? draft : typeof row.value === "number" ? String(row.value) : "";

          return (
            <li key={row.id} className="py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {row.kind === "numeric" ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      {...(row.max !== null ? { max: row.max } : {})}
                      value={energyValue}
                      disabled={!canManage || !row.manageable || busy}
                      aria-label={`${row.label} pentru acest anunț`}
                      className="h-7 w-20 text-xs"
                      onChange={(event) =>
                        setEnergyDraft((current) => ({ ...current, [row.id]: event.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={
                        !canManage ||
                        !row.manageable ||
                        busy ||
                        energyValue === "" ||
                        Number(energyValue) === (typeof row.value === "number" ? row.value : -1)
                      }
                      onClick={() => {
                        setPendingId(row.id);
                        mutate.mutate({
                          promotionId: row.id,
                          value: Math.max(Math.trunc(Number(energyValue) || 0), 0),
                        });
                      }}
                    >
                      Trimite
                    </Button>
                  </div>
                ) : (
                  <Checkbox
                    checked={active}
                    disabled={!canManage || busy || blocked}
                    aria-label={`${row.label} pentru acest anunț`}
                    onCheckedChange={(checked) => {
                      setPendingId(row.id);
                      mutate.mutate({ promotionId: row.id, value: checked === true });
                    }}
                  />
                )}

                <span className="text-xs font-medium">{row.label}</span>

                {row.slotType ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => setOpenSlot((current) => (current === row.id ? null : row.id))}
                    aria-expanded={openSlot === row.id}
                  >
                    {counter(row)}
                    <ChevronRight
                      className={cn("size-3 transition-transform", openSlot === row.id && "rotate-90")}
                      aria-hidden
                    />
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">fără contor</span>
                )}

                {row.available !== null ? (
                  <span className="text-xs text-muted-foreground">
                    {row.available > 0 ? `disponibile ${row.available}` : "fără locuri libere"}
                  </span>
                ) : null}

                {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
              </div>

              {row.error ? (
                <p className="mt-1 text-xs text-destructive">{row.error}</p>
              ) : !row.manageable ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.note ?? "Serviciu informativ: nu poate fi comandat din CRM."}
                </p>
              ) : !active && noSlots ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Toate locurile sunt ocupate — eliberează unul de la alt anunț sau cumpără locuri
                  suplimentare la Imobiliare.ro.
                </p>
              ) : active && noSlots ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Activ pe acest anunț; locurile sunt epuizate, dar dezactivarea rămâne posibilă.
                </p>
              ) : row.value === null && row.manageable ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Starea pe acest anunț nu a fost raportată de portal.
                </p>
              ) : null}

              {openSlot === row.id ? (
                <div className="mt-2 rounded-md border border-border bg-background p-2">
                  {listings.isFetching ? (
                    <p className="text-xs text-muted-foreground">
                      <Loader2 className="mr-1.5 inline size-3 animate-spin" aria-hidden />
                      Se citesc anunțurile care folosesc locurile…
                    </p>
                  ) : listings.data?.ok === false ? (
                    <p className="text-xs text-destructive">{listings.data.message}</p>
                  ) : (listings.data?.listings.length ?? 0) === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Niciun anunț nu folosește acest serviciu.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {listings.data?.listings.map((listing) => (
                        <li
                          key={`${listing.reference ?? ""}-${listing.listingId ?? ""}`}
                          className="text-xs"
                        >
                          <span className={cn(listing.isCurrent && "font-medium text-primary")}>
                            {listing.title ?? listing.reference ?? listing.listingId}
                          </span>
                          {listing.reference ? (
                            <span className="text-muted-foreground"> · {listing.reference}</span>
                          ) : null}
                          {listing.isCurrent ? (
                            <span className="text-muted-foreground"> · acest anunț</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
