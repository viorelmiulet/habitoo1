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
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Circle, ExternalLink } from "lucide-react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill, type StatusPillState } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { getMyPortalSlot } from "@/lib/portals/slots.functions";
import { PropertyImobiliarePromotionsCard } from "@/components/app/PropertyImobiliarePromotionsCard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { formatDateTime } from "@/lib/format";
import {
  applyPropertyPortalSelection,
  getPropertiesPortalMatrix,
  getPropertyPortalJournal,
  getPropertyPortalRequirements,
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

const STATE_VIEW: Record<PropertyPortalCell["state"], { label: string; pill: StatusPillState }> = {
  coming_soon: { label: "Inactiv", pill: "inactive" },
  not_configured: { label: "Neconfigurat", pill: "inactive" },
  not_selected: { label: "Inactiv", pill: "inactive" },
  selected: { label: "Selectat", pill: "pending" },
  syncing: { label: "Se sincronizează", pill: "pending" },
  published: { label: "Publicat", pill: "published" },
  in_feed: { label: "Activ în feed", pill: "published" },
  error: { label: "Refuzat", pill: "error" },
  expired: { label: "Expirat", pill: "pending" },
  withdrawn: { label: "Retras", pill: "inactive" },
};

function operationLabel(operation: string): string {
  const labels: Record<string, string> = {
    publish: "Publicare",
    update: "Actualizare",
    withdraw: "Retragere",
    status: "Verificare",
  };
  return labels[operation] ?? operation.replaceAll("_", " ");
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
    onCompleteMissing?: () => void;
  }
>(function PropertyPortalsCard({ organizationId, propertyId, onCompleteMissing }, ref) {
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

  /**
   * Validare pre-publicare: aceleași reguli care blochează publicarea
   * server-side, arătate agentului înainte să apese „Publică”.
   */
  const loadRequirements = useServerFn(getPropertyPortalRequirements);
  const requirements = useQuery({
    queryKey: ["property-portal-requirements", organizationId, propertyId] as const,
    queryFn: () =>
      loadRequirements({
        data: { ...(organizationId ? { organizationId } : {}), propertyId },
      }),
  });
  const loadJournal = useServerFn(getPropertyPortalJournal);
  const journal = useQuery({
    queryKey: ["property-portal-journal", organizationId, propertyId] as const,
    queryFn: () =>
      loadJournal({ data: { ...(organizationId ? { organizationId } : {}), propertyId } }),
  });
  const requirementByPortal = useMemo(() => {
    type Report = NonNullable<typeof requirements.data>[number];
    const map = new Map<string, Report>();
    for (const item of requirements.data ?? []) map.set(item.portalId, item);
    return map;
  }, [requirements.data]);

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
      queryClient.invalidateQueries({
        queryKey: ["property-portal-journal", organizationId, propertyId],
      });
    },
  });

  const applyPending = useCallback(async () => {
    const portalsActionable = canManage && actionable.length > 0;
    if (!portalsActionable && !collabDirty) return null;

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

  const allRequired = Array.from(
    new Map(
      (requirements.data ?? [])
        .flatMap((report) => report.required)
        .map((item) => [item.key, item] as const),
    ).values(),
  );
  const missingRequired = allRequired.filter((item) => !item.ok);
  const lastSync = cells
    .map((cell) => cell.lastSyncAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const latestFailureByPortal = new Map<string, NonNullable<typeof journal.data>[number]>();
  for (const item of journal.data ?? []) {
    if (!item.success && !latestFailureByPortal.has(item.portal)) {
      latestFailureByPortal.set(item.portal, item);
    }
  }

  return (
    <div className="grid items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <section aria-labelledby="portal-publication-title">
          <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="portal-publication-title" className="text-xl font-semibold">
                Unde este publicat
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeCount} din {totalRows} portaluri
                {lastSync ? ` · ultima sincronizare ${syncAgo(lastSync)}` : ""}
              </p>
            </div>
            {pendingCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                {pendingCount} {pendingCount === 1 ? "modificare" : "modificări"} de aplicat
              </span>
            ) : null}
          </header>

          <ul className="space-y-3">
            {collabVisible ? (
              <li>
                <Card
                  className={cn(
                    "p-5 text-sm",
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
                      <Circle
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground/60"
                      />
                    )}
                    <span className="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-surface">
                      <BrandLogo markOnly className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <label htmlFor="portal-habitoo-collaboration" className="font-semibold">
                          Colaborare Habitoo
                        </label>
                        <StatusPill state={collabValue ? "published" : "inactive"} dot>
                          {collabValue ? "Activ" : "Inactiv"}
                        </StatusPill>
                      </div>
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
                </Card>
              </li>
            ) : null}

            {cells.map((cell) => {
              const value = checked[cell.portalId] ?? cell.selected;
              const disabled = !canManage || cell.availability !== "available" || apply.isPending;
              const problem =
                cell.state === "error" ||
                Boolean(cell.lastError) ||
                (cell.availability === "available" && value && !cell.configured);
              const stateView = STATE_VIEW[cell.state];
              const failure = latestFailureByPortal.get(cell.portalId);
              const detail = stateSentence(cell, value);

              return (
                <li key={cell.portalId}>
                  <Card className="p-5 text-sm">
                    <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                      <PortalLogoStack portalId={cell.portalId} name={cell.portalName} size={40} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={`portal-${cell.portalId}`} className="font-semibold">
                            {cell.portalName}
                          </label>
                          <StatusPill state={stateView.pill} dot>
                            {stateView.label}
                          </StatusPill>
                        </div>
                        <p
                          className={cn(
                            "mt-1 text-xs",
                            problem ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {detail}
                          {problem && failure?.requestId ? ` · Cerere ${failure.requestId}` : ""}
                        </p>
                        <MyPortalSlotLine portalId={cell.portalId} />
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:justify-end">
                        {cell.publicUrl && !cell.publicWarning ? (
                          <Button variant="link" size="compact" asChild>
                            <a href={cell.publicUrl} target="_blank" rel="noopener noreferrer">
                              Vezi anunțul <ExternalLink aria-hidden />
                            </a>
                          </Button>
                        ) : problem ? (
                          <span className="text-xs font-semibold text-destructive">
                            Detalii eroare
                          </span>
                        ) : !cell.configured ? (
                          <span className="text-xs font-semibold text-gold-dark">
                            Cere activarea
                          </span>
                        ) : null}
                        {problem &&
                        canManage &&
                        cell.availability === "available" &&
                        cell.configured ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={apply.isPending}
                            onClick={() => void applyPending()}
                          >
                            {cell.lastSyncAt ? "Retrimite" : "Reîncearcă"}
                          </Button>
                        ) : null}
                        <Checkbox
                          id={`portal-${cell.portalId}`}
                          checked={value}
                          disabled={disabled}
                          aria-label={`${value ? "Dezactivează" : "Activează"} ${cell.portalName}`}
                          onCheckedChange={(next) => {
                            if (
                              next === true &&
                              cell.availability === "available" &&
                              !cell.configured
                            ) {
                              toast.error(
                                `${cell.portalName} nu este configurat. Configurează portalul în Setări.`,
                              );
                            }
                            setChecked((prev) => ({ ...prev, [cell.portalId]: next === true }));
                          }}
                        />
                      </div>
                    </div>

                    {/* Anunț trimis, dar pagina publică nu funcționează (cont fără abonament). */}
                    {cell.publicWarning ? (
                      <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                        {cell.publicWarning}
                      </p>
                    ) : null}

                    {/* Validare pre-publicare: ce lipsește, în cuvinte, pe acest portal. */}
                    {value && (requirementByPortal.get(cell.portalId)?.missing.length ?? 0) > 0 ? (
                      <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 pl-3 text-xs">
                        <p className="font-medium text-warning-foreground">
                          Publicarea este blocată până completezi:
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-warning-foreground">
                          {requirementByPortal.get(cell.portalId)?.missing.map((m) => (
                            <li key={m.key}>
                              {m.label} — {m.requirement}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {/* Auto-prelungire, doar pentru Storia și doar când portalul e bifat. */}
                    {cell.portalId === "storia" && value ? (
                      <StoriaAutoRenewControl
                        propertyId={propertyId}
                        organizationId={organizationId}
                        canManage={canManage}
                      />
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        {cells.some(
          (cell) => cell.portalId === "imobiliare_ro" && (checked[cell.portalId] ?? cell.selected),
        ) ? (
          <Panel className="p-5">
            <PropertyImobiliarePromotionsCard
              propertyId={propertyId}
              organizationId={organizationId}
              canManage={canManage}
            />
          </Panel>
        ) : null}
      </div>

      <aside className="space-y-4">
        <Panel className="p-5">
          <h2 className="text-lg font-semibold">Pregătire pentru publicare</h2>
          {allRequired.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nu există verificări suplimentare pentru portalurile active.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {allRequired.map((item) => (
                <li key={item.key} className="flex items-start gap-2 text-sm">
                  {item.ok ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <AlertTriangle
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                      aria-hidden
                    />
                  )}
                  <span>
                    <span className="font-semibold">{item.label}</span>
                    <span className="block text-xs text-muted-foreground">{item.requirement}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {missingRequired.length > 0 && onCompleteMissing ? (
            <Button
              type="button"
              variant="soft"
              className="mt-5 w-full"
              onClick={onCompleteMissing}
            >
              Completează ce lipsește
            </Button>
          ) : null}
        </Panel>

        <Panel className="p-5">
          <h2 className="text-lg font-semibold">Jurnal portal</h2>
          {(journal.data?.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nicio operație înregistrată pentru această proprietate.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {journal.data?.map((item) => (
                <li key={item.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">{portalDisplayLabel(cells, item.portal)}</span>
                    <span className={item.success ? "text-success" : "text-destructive"}>
                      {item.success ? "Reușit" : "Eșuat"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {syncAgo(item.createdAt)} · {operationLabel(item.operation)}
                  </p>
                  {item.errorMessage ? (
                    <p className="mt-1 text-xs text-destructive">{item.errorMessage}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </aside>
    </div>
  );
});

function portalDisplayLabel(cells: PropertyPortalCell[], portalId: string): string {
  return cells.find((cell) => cell.portalId === portalId)?.portalName ?? portalId;
}

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

/**
 * Câte locuri de publicare are utilizatorul curent pe un portal: doar citire,
 * doar rândul lui (fără totalul agenției și fără alți utilizatori).
 */
function MyPortalSlotLine({ portalId }: { portalId: string }) {
  const loadMine = useServerFn(getMyPortalSlot);
  const mine = useQuery({
    queryKey: ["my-portal-slot", portalId],
    queryFn: () => loadMine({ data: { portalId } }),
    retry: false,
  });
  if (!mine.data) return null;
  const total = mine.data.allocated;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Locurile tale pe acest portal: {mine.data.used}
      {total === null ? " (nelimitat)" : ` / ${total}`}
      {mine.data.agencyExhausted ? " — agenția nu mai are locuri libere." : ""}
    </p>
  );
}
