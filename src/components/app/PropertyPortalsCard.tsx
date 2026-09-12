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
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Circle, ExternalLink } from "lucide-react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { formatDateTime } from "@/lib/format";
import {
  applyPropertyPortalSelection,
  getPropertiesPortalMatrix,
  getPropertyStoriaAutoRenew,
  setPropertyStoriaAutoRenew,
  type PropertyPortalCell,
} from "@/lib/portals.functions";
import { getPropertyCollaboration, setPropertyCollaboration } from "@/lib/collaboration.functions";

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
  if (cell.state === "expired")
    return "Anunțul a expirat pe portal — apasă „Publică” pentru a-l republica.";
  if (cell.state === "withdrawn") return "Retrasă de pe portal.";
  if (cell.state === "selected") return "Selectat — se trimite la următoarea apăsare pe „Publică”.";
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
            Bifează portalurile pe care vrei oferta publicată. Debifarea unui portal retrage oferta
            doar de pe acel portal.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {activeCount} din {totalRows} active
        </span>
      </header>

      <ul className="divide-y divide-border">
        {collabVisible ? (
          <li
            className={cn(
              "px-5 py-4 text-sm",
              collabValue && collabPercent.trim() === "" && "bg-warning/10",
            )}
          >
            <div className="flex flex-wrap items-start gap-3">
              <Checkbox
                id="portal-habitoo-collaboration"
                checked={collabValue}
                className="mt-0.5"
                onCheckedChange={(next) => setCollabChecked(next === true)}
              />
              {collabValue ? (
                <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
              )}
              <span className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                <BrandLogo markOnly className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor="portal-habitoo-collaboration" className="font-medium">
                  Colaborare Habitoo
                </label>
                <p className="text-xs text-muted-foreground">
                  {!collabRow?.offerable && collabValue
                    ? "Oferta ajunge la celelalte agenții doar când proprietatea este activă."
                    : collabValue
                      ? collabRow?.enabled
                        ? "Vizibilă altor agenții Habitoo, fără datele proprietarului."
                        : "Selectat — se trimite la următoarea apăsare pe „Publică”."
                      : collabRow?.enabled
                        ? "Se retrage din rețeaua de colaborare la următoarea publicare."
                        : "Neselectat."}
                </p>
              </div>
            </div>

            {collabValue ? (
              <div className="mt-3 grid gap-3 pl-9 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="collab-percent" className="text-xs">
                    Comision oferit (%)
                  </Label>
                  <Input
                    id="collab-percent"
                    inputMode="decimal"
                    placeholder="Ex. 1.5"
                    value={collabPercent}
                    onChange={(e) => setCollabPercent(e.target.value)}
                  />
                  {collabPercent.trim() === "" ? (
                    <p className="text-xs text-warning-foreground">
                      Obligatoriu cât timp colaborarea este activă.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="collab-terms" className="text-xs">
                    Condiții (opțional)
                  </Label>
                  <Textarea
                    id="collab-terms"
                    rows={2}
                    placeholder="Ex. vizionări doar cu agentul proprietății"
                    value={collabTerms}
                    onChange={(e) => setCollabTerms(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </li>
        ) : null}

        {cells.map((cell) => {
          const value = checked[cell.portalId] ?? cell.selected;
          const disabled = !canManage || cell.availability !== "available" || apply.isPending;
          const problem =
            cell.state === "error" ||
            Boolean(cell.lastError) ||
            (cell.availability === "available" && value && !cell.configured);
          const StateIcon = problem ? AlertTriangle : value ? CheckCircle2 : Circle;

          return (
            <li key={cell.portalId} className={cn("px-5 py-4 text-sm", problem && "bg-warning/10")}>
              <div className="flex flex-wrap items-start gap-3">
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
                    problem
                      ? "text-warning-foreground"
                      : value
                        ? "text-success"
                        : "text-muted-foreground/60",
                  )}
                />
                <PortalLogoStack portalId={cell.portalId} name={cell.portalName} size={28} />
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
              </div>

              {/* Auto-prelungire, doar pentru Storia și doar când portalul e bifat. */}
              {cell.portalId === "storia" && value ? (
                <StoriaAutoRenewControl
                  propertyId={propertyId}
                  organizationId={organizationId}
                  canManage={canManage}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? "modificare" : "modificări"} de aplicat.`
            : canManage
              ? "Nicio modificare de salvat."
              : "Doar administratorul agenției poate modifica publicarea pe portaluri."}
        </p>
        <span className="text-xs text-muted-foreground">
          Se aplică prin butonul „Publică” din rândul de acțiuni al paginii.
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
            >
              Confirmă retragerea
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
});

/**
 * Auto-prelungire Storia la nivel de proprietate: comutator segmentat cu trei
 * poziții — „Setarea agenției” (implicit, moștenire), „Activat”, „Dezactivat”.
 * Eticheta de dedesubt spune explicit dacă anunțul moștenește sau suprascrie.
 */
function StoriaAutoRenewControl({
  propertyId,
  organizationId,
  canManage,
}: {
  propertyId: string;
  organizationId?: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPropertyStoriaAutoRenew);
  const save = useServerFn(setPropertyStoriaAutoRenew);
  const queryKey = ["property-storia-auto-renew", organizationId, propertyId] as const;

  const state = useQuery({
    queryKey,
    queryFn: () => load({ data: { ...(organizationId ? { organizationId } : {}), propertyId } }),
  });

  const mutate = useMutation({
    mutationFn: (override: boolean | null) =>
      save({ data: { ...(organizationId ? { organizationId } : {}), propertyId, override } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success("Auto-prelungirea Storia a fost salvată.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!state.data) return null;
  const { override, agencyDefault, effective } = state.data;

  const options: { value: boolean | null; label: string }[] = [
    { value: null, label: "Setarea agenției" },
    { value: true, label: "Activat" },
    { value: false, label: "Dezactivat" },
  ];

  const summary =
    override === null
      ? `Moștenește setarea agenției (${agencyDefault ? "activată" : "dezactivată"}).`
      : `Suprascriere: ${override ? "activată" : "dezactivată"} pentru acest anunț.`;

  return (
    <div className="mt-3 pl-9">
      <p className="text-xs font-medium">Auto-prelungire la expirare</p>
      <div
        role="group"
        aria-label="Auto-prelungire Storia pentru acest anunț"
        className="mt-1.5 inline-flex rounded-lg bg-secondary p-0.5"
      >
        {options.map((option) => {
          const active = override === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={active}
              disabled={!canManage || mutate.isPending}
              onClick={() => mutate.mutate(option.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {summary}
        {effective
          ? " Anunțul expirat va fi republicat automat."
          : " Anunțul expirat rămâne marcat expirat, fără republicare."}
      </p>
    </div>
  );
}
