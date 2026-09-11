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
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, ExternalLink } from "lucide-react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PortalLogo } from "@/components/app/PortalLogo";
import { BrandLogo } from "@/components/brand/BrandLogo";
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
import { formatDateTime } from "@/lib/format";
import {
  applyPropertyPortalSelection,
  getPropertiesPortalMatrix,
  type PropertyPortalCell,
} from "@/lib/portals.functions";
import {
  getPropertyCollaboration,
  setPropertyCollaboration,
} from "@/lib/collaboration.functions";

/** „acum 4 min” / „acum 3 h” / data completă, pentru ultima sincronizare. */
function syncAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "chiar acum";
  if (minutes < 60) return `acum ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `acum ${hours} h`;
  return formatDateTime(iso);
}

/** Starea concretă a portalului, în cuvinte, pentru rândul din listă. */
function stateSentence(cell: PropertyPortalCell, selected: boolean) {
  if (cell.availability !== "available") return "Integrarea nu este încă disponibilă.";
  if (!cell.configured)
    return selected
      ? "Portal neconfigurat — configurează-l pentru a putea publica."
      : "Portal neconfigurat.";
  if (cell.lastError) return cell.lastError;
  if (cell.state === "error")
    return "Portalul a raportat o problemă la acest anunț, fără detalii. Apasă „Retrimite” pentru mesajul portalului.";
  if (cell.state === "syncing") return "Se sincronizează cu portalul…";
  if (cell.state === "published" || cell.state === "in_feed") {
    const base = cell.state === "in_feed" ? "Activ în feedul portalului" : "Activ pe portal";
    return cell.lastSyncAt ? `${base} · sincronizat ${syncAgo(cell.lastSyncAt)}` : base;
  }
  if (cell.state === "withdrawn") return "Retrasă de pe portal.";
  if (cell.state === "selected")
    return "Selectat — se trimite la următoarea apăsare pe „Publică”.";
  return "Neselectat.";
}

export type PortalApplyResult = {
  portalId: string;
  portalName: string;
  ok: boolean;
  message: string | null;
};

/**
 * Handle imperativ folosit de butonul unic „Publică” din antetul paginii:
 * aplică exact bifele curente. `null` = nimic de aplicat (sau retragere anulată).
 */
export type PropertyPortalsHandle = {
  applyPending: () => Promise<{ results: PortalApplyResult[] } | null>;
};

export const PropertyPortalsCard = forwardRef<
  PropertyPortalsHandle,
  {
    /** Doar Superadmin trimite agenția explicit; agenția o ia din sesiune. */
    organizationId?: string;
    propertyId: string;
  }
>(function PropertyPortalsCard({ organizationId, propertyId }, ref) {
  const queryClient = useQueryClient();
  const loadMatrix = useServerFn(getPropertiesPortalMatrix);
  const applyFn = useServerFn(applyPropertyPortalSelection);
  const queryKey = ["property-portals-selection", organizationId, propertyId] as const;

  const matrix = useQuery({
    queryKey,
    queryFn: () =>
      loadMatrix({
        data: { ...(organizationId ? { organizationId } : {}), propertyIds: [propertyId] },
      }),
  });

  const cells = useMemo<PropertyPortalCell[]>(
    () => matrix.data?.properties[propertyId] ?? [],
    [matrix.data, propertyId],
  );
  const canManage = matrix.data?.canManage ?? false;

  /**
   * Colaborarea Habitoo se comportă ca un portal: același rând, aceeași bifă,
   * aplicată prin același buton „Publică”. Datele rămân pe proprietate.
   */
  const loadCollab = useServerFn(getPropertyCollaboration);
  const saveCollab = useServerFn(setPropertyCollaboration);
  const collabKey = ["property-collaboration", propertyId] as const;
  const collab = useQuery({
    queryKey: collabKey,
    queryFn: () => loadCollab({ data: { propertyId } }),
  });
  const collabRow = collab.data ?? null;
  /** Rândul apare doar dacă agenția participă la rețeaua de colaborare. */
  const collabVisible = collabRow?.participating === true;

  const [collabChecked, setCollabChecked] = useState<boolean | null>(null);
  const [collabPercent, setCollabPercent] = useState("");
  const [collabTerms, setCollabTerms] = useState("");

  useEffect(() => {
    if (!collabRow) return;
    setCollabChecked(collabRow.enabled);
    setCollabPercent(
      collabRow.commissionPercent !== null ? String(collabRow.commissionPercent) : "",
    );
    setCollabTerms(collabRow.terms ?? "");
  }, [collabRow]);

  const collabValue = collabChecked ?? collabRow?.enabled ?? false;
  const collabDirty =
    collabVisible &&
    (collabValue !== (collabRow?.enabled ?? false) ||
      (collabValue &&
        (collabPercent.trim() !==
          (collabRow?.commissionPercent !== null && collabRow?.commissionPercent !== undefined
            ? String(collabRow.commissionPercent)
            : "") ||
          collabTerms.trim() !== (collabRow?.terms ?? ""))));

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (cells.length === 0) return;
    setChecked(Object.fromEntries(cells.map((c) => [c.portalId, c.selected])));
  }, [cells]);

  const dirty = cells.filter((c) => (checked[c.portalId] ?? c.selected) !== c.selected);
  /**
   * Portaluri bifate care trebuie sincronizate la apăsarea butonului „Publică”:
   * fie sunt publicate (→ actualizare cu datele curente), fie sunt retrase/în
   * eroare (→ republicare).
   */
  const toSync = cells.filter(
    (c) => c.availability === "available" && (checked[c.portalId] ?? c.selected),
  );
  const actionable = [...new Set([...dirty, ...toSync])];
  /** Portaluri debifate care sunt efectiv publicate → necesită confirmare. */
  const toWithdraw = dirty.filter(
    (c) => !(checked[c.portalId] ?? false) && (c.state === "published" || c.state === "in_feed"),
  );


  const apply = useMutation({
    mutationFn: () =>
      applyFn({
        data: {
          ...(organizationId ? { organizationId } : {}),
          propertyId,
          selections: cells
            .filter((c) => c.availability === "available")
            .map((c) => ({ portalId: c.portalId, enabled: checked[c.portalId] ?? c.selected })),
          // Butonul unic „Publică” sincronizează starea curentă, deci ofertele
          // deja publicate primesc o actualizare reală cu datele editate.
          syncExisting: true,
        },
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["property-portals-matrix"] });
    },
  });

  /** Rezolvatorul confirmării de retragere, cât timp dialogul este deschis. */
  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);

  const applyPending = useCallback(async () => {
    const portalsActionable = canManage && actionable.length > 0;
    if (!portalsActionable && !collabDirty) return null;

    if (portalsActionable && toWithdraw.length > 0) {
      const confirmed = await new Promise<boolean>((resolve) => {
        confirmResolver.current = resolve;
        setConfirming(true);
      });
      if (!confirmed) return null;
    }

    const results: PortalApplyResult[] = [];

    // Colaborarea se salvează separat de portaluri: o eroare aici nu blochează
    // publicarea pe portaluri, exact ca între portaluri.
    if (collabDirty) {
      const percent = collabPercent.trim() === "" ? null : Number(collabPercent);
      if (collabValue && (percent === null || Number.isNaN(percent))) {
        throw new Error("Completează comisionul oferit pentru Colaborare Habitoo.");
      }
      try {
        await saveCollab({
          data: {
            propertyId,
            enabled: collabValue,
            commissionPercent: collabValue ? percent : null,
            terms: collabValue ? collabTerms.trim() || null : null,
          },
        });
        results.push({
          portalId: "habitoo_collaboration",
          portalName: "Colaborare Habitoo",
          ok: true,
          message: collabValue
            ? "Colaborare Habitoo: ofertă activă"
            : "Colaborare Habitoo: ofertă retrasă",
        });
      } catch (e) {
        results.push({
          portalId: "habitoo_collaboration",
          portalName: "Colaborare Habitoo",
          ok: false,
          message: e instanceof Error ? e.message : "Colaborare Habitoo: salvarea a eșuat.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: collabKey });
      void queryClient.invalidateQueries({ queryKey: ["collaboration-offers"] });
    }

    if (portalsActionable) {
      const portals = await apply.mutateAsync();
      results.push(...portals.results);
    }

    return { results };
  }, [
    canManage,
    actionable.length,
    toWithdraw.length,
    apply,
    collabDirty,
    collabValue,
    collabPercent,
    collabTerms,
    propertyId,
    saveCollab,
    queryClient,
  ]);

  useImperativeHandle(ref, () => ({ applyPending }), [applyPending]);

  if (matrix.isLoading || collab.isLoading)
    return <InlineLoading label="Se încarcă publicarea pe portaluri…" />;
  if (matrix.isError) return <QueryError error={matrix.error} onRetry={() => matrix.refetch()} />;
  // Nicio secțiune când agenției nu i-a fost activat niciun portal și nu participă la colaborare.
  if (cells.length === 0 && !collabVisible) return null;

  const activeCount =
    cells.filter((c) => c.state === "published" || c.state === "in_feed").length +
    (collabVisible && collabRow?.enabled ? 1 : 0);
  const totalRows = cells.length + (collabVisible ? 1 : 0);
  const pendingCount = (canManage ? actionable.length : 0) + (collabDirty ? 1 : 0);

  return (
    <section className="panel">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-medium">Publicare pe portaluri</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bifează portalurile pe care vrei oferta publicată. Debifarea unui portal retrage oferta doar de pe
            acel portal.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {activeCount} din {cells.length} active
        </span>
      </header>

      <ul className="divide-y divide-border">
        {cells.map((cell) => {
          const value = checked[cell.portalId] ?? cell.selected;
          const disabled = !canManage || cell.availability !== "available" || apply.isPending;
          const problem =
            cell.state === "error" ||
            Boolean(cell.lastError) ||
            (cell.availability === "available" && value && !cell.configured);
          const StateIcon = problem ? AlertTriangle : value ? CheckCircle2 : Circle;

          return (
            <li
              key={cell.portalId}
              className={cn(
                "flex flex-wrap items-start gap-3 px-5 py-4 text-sm",
                problem && "bg-warning/10",
              )}
            >
              <Checkbox
                id={`portal-${cell.portalId}`}
                checked={value}
                disabled={disabled}
                className="mt-0.5"
                onCheckedChange={(next) => {
                  if (next === true && cell.availability === "available" && !cell.configured) {
                    toast.error(
                      `${cell.portalName} nu este configurat. Configurează portalul în această pagină.`,
                    );
                  }
                  setChecked((prev) => ({ ...prev, [cell.portalId]: next === true }));
                }}
              />
              <StateIcon
                aria-hidden
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  problem ? "text-warning-foreground" : value ? "text-success" : "text-muted-foreground/60",
                )}
              />
              <PortalLogo portalId={cell.portalId} name={cell.portalName} size={28} />
              <div className="min-w-0 flex-1">
                <label htmlFor={`portal-${cell.portalId}`} className="font-medium">
                  {cell.portalName}
                </label>
                <p
                  className={cn(
                    "text-xs",
                    problem ? "text-warning-foreground" : "text-muted-foreground",
                  )}
                >
                  {stateSentence(cell, value)}
                </p>
              </div>

              {problem && canManage && cell.availability === "available" && cell.configured ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={apply.isPending}
                  onClick={() => void applyPending()}
                >
                  Retrimite
                </Button>
              ) : null}

              {/* Linkul public al anunțului, când portalul îl întoarce. */}
              {cell.publicUrl ? (
                <a
                  href={cell.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Deschide anunțul pe ${cell.portalName}`}
                  aria-label={`Deschide anunțul pe ${cell.portalName} într-un tab nou`}
                  className="mt-1 text-muted-foreground transition-colors hover:text-primary"
                >
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">
          {canManage
            ? actionable.length > 0
              ? `${actionable.length} ${actionable.length === 1 ? "modificare" : "modificări"} de aplicat.`
              : "Nicio modificare de salvat."
            : "Doar administratorul agenției poate modifica publicarea."}
        </p>
        <span className="text-xs text-muted-foreground">
          Se aplică prin butonul „Publică” din partea de sus a paginii.
        </span>
      </footer>


      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) {
            confirmResolver.current?.(false);
            confirmResolver.current = null;
          }
        }}
      >
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
            <AlertDialogAction
              onClick={() => {
                const resolve = confirmResolver.current;
                confirmResolver.current = null;
                setConfirming(false);
                resolve?.(true);
              }}
            >Confirmă retragerea</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
});
