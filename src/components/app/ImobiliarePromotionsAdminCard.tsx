/**
 * PROMOVĂRI IMOBILIARE.RO — administrarea agenției.
 *
 * Contoarele portalului (folosite / total) și consumul agenților vin LIVE la
 * fiecare deschidere. Un serviciu neactivat nu se folosește în agenție. Plafonul
 * gol = limita este rezerva cumpărată la portal; alocarea goală = nelimitat în
 * limita agenției. „Puncte Energy” este un buget numeric, nu un număr de locuri.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getImobiliarePromotionAdmin,
  previewImobiliarePromotionWithdrawals,
  setImobiliarePromotionAllocation,
  setImobiliarePromotionCap,
  setImobiliarePromotionService,
  type PromotionAdminService,
  type PromotionWithdrawPreviewRow,
} from "@/lib/portals/promotions/promotion-admin.functions";

/** Modificarea cerută de administrator, ținută până la confirmare. */
type PendingChange =
  | { kind: "cap"; serviceKey: string; serviceLabel: string; cap: number | null }
  | {
      kind: "allocation";
      serviceKey: string;
      serviceLabel: string;
      userId: string;
      userName: string;
      amount: number | null;
    };

function poolLabel(service: PromotionAdminService): string {
  if (service.poolTotal === null || service.poolUsed === null) return "fără contor";
  return `${service.poolUsed} / ${service.poolTotal} folosite · ${service.poolAvailable ?? 0} libere`;
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

export function ImobiliarePromotionsAdminCard({ organizationId }: { organizationId?: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getImobiliarePromotionAdmin);
  const saveService = useServerFn(setImobiliarePromotionService);
  const saveCap = useServerFn(setImobiliarePromotionCap);
  const saveAllocation = useServerFn(setImobiliarePromotionAllocation);
  const queryKey = ["imobiliare-promotion-admin", organizationId ?? null] as const;

  const view = useQuery({
    queryKey,
    queryFn: () => load({ data: organizationId ? { organizationId } : {} }),
  });

  const [capDraft, setCapDraft] = useState<Record<string, string>>({});
  const [allocationDraft, setAllocationDraft] = useState<Record<string, string>>({});

  const refresh = () => void queryClient.invalidateQueries({ queryKey });
  const org = organizationId ? { organizationId } : {};

  const toggle = useMutation({
    mutationFn: (input: { serviceKey: string; enabled: boolean }) =>
      saveService({ data: { ...org, ...input } }),
    onSuccess: (result) => {
      result.ok ? toast.success(result.message) : toast.error(result.message);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cap = useMutation({
    mutationFn: (input: { serviceKey: string; cap: number | null }) =>
      saveCap({ data: { ...org, ...input } }),
    onSuccess: (result) => {
      result.ok ? toast.success(result.message) : toast.error(result.message);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const allocation = useMutation({
    mutationFn: (input: { serviceKey: string; userId: string; amount: number | null }) =>
      saveAllocation({ data: { ...org, ...input } }),
    onSuccess: (result) => {
      result.ok ? toast.success(result.message) : toast.error(result.message);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const services = useMemo(() => view.data?.services ?? [], [view.data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Promovări Imobiliare.ro</CardTitle>
          <CardDescription>
            Alege serviciile folosite de agenție, plafonul pe fiecare serviciu și cât primește
            fiecare coleg. Câmp gol la plafon = limita este rezerva cumpărată la portal; câmp gol la
            alocare = nelimitat în limita agenției.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {view.data?.syncedAt ? (
            <span className="text-xs text-muted-foreground">
              Sincronizat {formatDateTime(view.data.syncedAt)}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={view.isFetching}
            onClick={() => void view.refetch()}
          >
            <RefreshCw className={cn("mr-1.5 size-3.5", view.isFetching && "animate-spin")} aria-hidden />
            Sincronizează
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {view.isLoading ? (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="mr-1.5 inline size-3.5 animate-spin" aria-hidden />
            Se citesc serviciile de la Imobiliare.ro…
          </p>
        ) : view.isError ? (
          <p className="text-sm text-destructive">{(view.error as Error).message}</p>
        ) : !view.data?.available ? (
          <p className="text-sm text-muted-foreground">
            {view.data?.message ?? "Promovările Imobiliare.ro nu sunt disponibile."}
          </p>
        ) : (
          services.map((service) => {
            const capValue = capDraft[service.serviceKey];
            const capText =
              capValue !== undefined
                ? capValue
                : service.agencyCap === null
                  ? ""
                  : String(service.agencyCap);
            return (
              <section key={service.serviceKey} className="rounded-lg border border-border p-3">
                <header className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={service.enabled}
                      disabled={!service.manageable || toggle.isPending}
                      aria-label={`Folosește ${service.label} în agenție`}
                      onCheckedChange={(checked) =>
                        toggle.mutate({ serviceKey: service.serviceKey, enabled: checked })
                      }
                    />
                    <div>
                      <p className="text-sm font-medium">{service.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {poolLabel(service)}
                        {service.kind === "numeric" ? " · buget de puncte" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground" htmlFor={`cap-${service.serviceKey}`}>
                      Plafon agenție
                    </label>
                    <Input
                      id={`cap-${service.serviceKey}`}
                      type="number"
                      min={0}
                      placeholder="nelimitat"
                      className="h-8 w-24 text-xs"
                      value={capText}
                      disabled={!service.manageable}
                      onChange={(event) =>
                        setCapDraft((current) => ({
                          ...current,
                          [service.serviceKey]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      disabled={!service.manageable || cap.isPending}
                      onClick={() =>
                        cap.mutate({
                          serviceKey: service.serviceKey,
                          cap: numberOrNull(capText),
                        })
                      }
                    >
                      Salvează
                    </Button>
                  </div>
                </header>

                {service.poolError ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                    {service.poolError}
                  </p>
                ) : null}
                {service.usageError ? (
                  <p className="mt-2 text-xs text-destructive">{service.usageError}</p>
                ) : service.usagePartial ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Consumul citit este incomplet, deci cifrele de mai jos pot fi mai mici decât cele
                    reale.
                  </p>
                ) : null}
                {!service.manageable ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {service.note ?? "Serviciu informativ: nu poate fi comandat din CRM."}
                  </p>
                ) : null}

                {service.enabled && service.manageable ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="py-1 text-left font-medium">Coleg</th>
                          <th className="py-1 text-left font-medium">Folosit</th>
                          <th className="py-1 text-left font-medium">Alocare</th>
                          <th className="py-1 text-left font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {service.cells.map((cell) => {
                          const key = `${service.serviceKey}:${cell.userId}`;
                          const draft = allocationDraft[key];
                          const text =
                            draft !== undefined
                              ? draft
                              : cell.allocated === null
                                ? ""
                                : String(cell.allocated);
                          return (
                            <tr key={cell.userId} className="border-t border-border/60">
                              <td className="py-1.5">{cell.name}</td>
                              <td className="py-1.5">
                                {cell.used}
                                {cell.allocated !== null ? ` / ${cell.allocated}` : ""}
                              </td>
                              <td className="py-1.5">
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder="nelimitat"
                                  className="h-8 w-24 text-xs"
                                  aria-label={`Alocare ${service.label} pentru ${cell.name}`}
                                  value={text}
                                  onChange={(event) =>
                                    setAllocationDraft((current) => ({
                                      ...current,
                                      [key]: event.target.value,
                                    }))
                                  }
                                />
                              </td>
                              <td className="py-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs"
                                  disabled={allocation.isPending}
                                  onClick={() =>
                                    allocation.mutate({
                                      serviceKey: service.serviceKey,
                                      userId: cell.userId,
                                      amount: numberOrNull(text),
                                    })
                                  }
                                >
                                  Salvează
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Agenția a folosit {service.agencyUsed}
                      {service.agencyCap !== null ? ` / ${service.agencyCap}` : ""}
                      {service.kind === "numeric" ? " puncte" : " locuri"}.
                    </p>
                  </div>
                ) : null}
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
