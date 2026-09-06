/**
 * PUBLICARE PE PORTALURI — secțiunea din pagina proprietății.
 *
 * Checkbox-ul fiecărui portal este SURSA DE ADEVĂR pentru publicarea acestei
 * proprietăți pe acel portal:
 *   bifat   = vreau oferta publicată pe portal;
 *   debifat = nu vreau oferta publicată (dacă era publicată → retragere reală).
 *
 * Separă intenția (checkbox) de starea reală a integrării (status), fără să
 * introducă o a doua sursă de adevăr.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
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
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  applyPropertyPortalSelection,
  getPropertiesPortalMatrix,
  type PropertyPortalCell,
} from "@/lib/portals.functions";

const STATE_LABEL: Record<
  PropertyPortalCell["state"],
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  in_feed: { label: "Publicată în feed", tone: "success" },
  published: { label: "Publicată", tone: "success" },
  selected: { label: "În așteptare", tone: "warning" },
  syncing: { label: "Se sincronizează", tone: "warning" },
  error: { label: "Eroare", tone: "danger" },
  withdrawn: { label: "Retrasă", tone: "neutral" },
  not_selected: { label: "Nepublicată", tone: "neutral" },
  not_configured: { label: "Nepublicată", tone: "neutral" },
  coming_soon: { label: "În curând", tone: "neutral" },
};

export function PropertyPortalsCard({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const loadMatrix = useServerFn(getPropertiesPortalMatrix);
  const applyFn = useServerFn(applyPropertyPortalSelection);
  const queryKey = ["property-portals-selection", propertyId] as const;

  const matrix = useQuery({
    queryKey,
    queryFn: () => loadMatrix({ data: { propertyIds: [propertyId] } }),
  });

  const cells = useMemo<PropertyPortalCell[]>(
    () => matrix.data?.properties[propertyId] ?? [],
    [matrix.data, propertyId],
  );
  const canManage = matrix.data?.canManage ?? false;

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (cells.length === 0) return;
    setChecked(Object.fromEntries(cells.map((c) => [c.portalId, c.selected])));
  }, [cells]);

  const dirty = cells.filter((c) => (checked[c.portalId] ?? c.selected) !== c.selected);
  /** Portaluri debifate care sunt efectiv publicate → necesită confirmare. */
  const toWithdraw = dirty.filter(
    (c) => !(checked[c.portalId] ?? false) && (c.state === "published" || c.state === "in_feed"),
  );

  const apply = useMutation({
    mutationFn: () =>
      applyFn({
        data: {
          propertyId,
          selections: cells
            .filter((c) => c.availability === "available")
            .map((c) => ({ portalId: c.portalId, enabled: checked[c.portalId] ?? c.selected })),
          syncExisting: false,
        },
      }),
    onSuccess: (res) => {
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["property-portals-matrix"] });
      const failed = res.results.filter((r) => !r.ok);
      const done = res.results.filter((r) => r.ok && r.message);
      if (done.length > 0) toast.success(done.map((r) => r.message).join(" · "));
      if (failed.length > 0) toast.error(failed.map((r) => r.message).join(" · "));
      if (done.length === 0 && failed.length === 0) toast.message("Nicio schimbare de publicare.");
    },
    onError: (e: Error) => toastError(e),
  });

  if (matrix.isLoading) return <InlineLoading label="Se încarcă publicarea pe portaluri…" />;
  if (matrix.isError) return <QueryError error={matrix.error} onRetry={() => matrix.refetch()} />;

  return (
    <section className="panel">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Publicare pe portaluri</h2>
        <p className="text-xs text-muted-foreground">
          Bifează portalurile pe care vrei oferta publicată. Debifarea unui portal retrage oferta doar de pe
          acel portal.
        </p>
      </header>

      <ul className="divide-y divide-border">
        {cells.map((cell) => {
          const badge = STATE_LABEL[cell.state];
          const value = checked[cell.portalId] ?? cell.selected;
          const disabled = !canManage || cell.availability !== "available" || apply.isPending;
          return (
            <li key={cell.portalId} className="flex flex-wrap items-start gap-3 px-5 py-3.5 text-sm">
              <Checkbox
                id={`portal-${cell.portalId}`}
                checked={value}
                disabled={disabled}
                className="mt-0.5"
                onCheckedChange={(next) => {
                  if (next === true && cell.availability === "available" && !cell.configured) {
                    toast.error(
                      `${cell.portalName} nu este configurat. Configurează portalul din Setări → Integrări.`,
                    );
                  }
                  setChecked((prev) => ({ ...prev, [cell.portalId]: next === true }));
                }}
              />
              <div className="min-w-0 flex-1">
                <label htmlFor={`portal-${cell.portalId}`} className="font-medium">
                  {cell.portalName}
                </label>
                <p className="text-xs text-muted-foreground">
                  {cell.availability !== "available"
                    ? "Integrarea nu este încă disponibilă."
                    : !cell.configured
                      ? "Portal neconfigurat — Setări → Integrări."
                      : cell.pushSupported
                        ? "Trimitere directă către portal."
                        : "Portalul preia oferta automat din feedul Habitoo."}
                  {cell.lastSyncAt ? ` · Ultima sincronizare: ${formatDateTime(cell.lastSyncAt)}` : ""}
                </p>
                {cell.lastError ? <p className="text-xs text-destructive">{cell.lastError}</p> : null}
              </div>
              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            </li>
          );
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">
          {canManage
            ? dirty.length > 0
              ? `${dirty.length} ${dirty.length === 1 ? "modificare" : "modificări"} nesalvate.`
              : "Nicio modificare de salvat."
            : "Doar administratorul agenției poate modifica publicarea."}
        </p>
        <div className="flex items-center gap-3">
          {cells.some((c) => c.availability === "available" && !c.configured) ? (
            <Link to="/app/settings" className="text-xs text-primary underline-offset-2 hover:underline">
              Setări → Integrări
            </Link>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!canManage || dirty.length === 0 || apply.isPending}
            onClick={() => (toWithdraw.length > 0 ? setConfirming(true) : apply.mutate())}
          >
            {apply.isPending ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 size-3.5" />
            )}
            Salvează publicarea
          </Button>
        </div>
      </footer>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toWithdraw.length === 1
                ? `Proprietatea va fi retrasă de pe ${toWithdraw[0]?.portalName}`
                : "Proprietatea va fi retrasă de pe mai multe portaluri"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toWithdraw.length > 1 ? (
                <>
                  Proprietatea va fi retrasă de pe:
                  <br />
                  {toWithdraw.map((c) => `- ${c.portalName}`).join("\n")}
                  <br />
                  Celelalte portaluri selectate vor rămâne active.
                </>
              ) : (
                "Celelalte portaluri selectate vor rămâne active."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={() => apply.mutate()}>Confirmă retragerea</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
