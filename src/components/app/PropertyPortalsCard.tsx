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
import { ContactBlockNotice } from "@/components/app/ContactBlockNotice";
import { Link } from "@tanstack/react-router";
import { FEED_EXCLUDED_NO_PHONE, FEED_PORTALS_REQUIRING_AGENT_PHONE } from "@/lib/portals/listing-contact";
import { useCurrentUser } from "@/hooks/use-session";
import { getPropertyAutoWithdrawals, type AutoWithdrawView } from "@/lib/property-status.functions";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AlertTriangle, Check, ExternalLink } from "lucide-react";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { effectivePromoted } from "@/lib/portals/promotion-flag";
import { PortalLogo, PortalLogoStack } from "@/components/app/PortalLogo";
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
import {
  getPropertyFacebookCatalog,
  setPropertyFacebookCatalog,
} from "@/lib/facebook-catalog-listings.functions";
import { FACEBOOK_LISTING_FIX, facebookListingState } from "@/lib/facebook-catalog-status";

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
    return cell.lastSyncAt ? `Ultima actualizare: ${syncAgo(cell.lastSyncAt)}` : "Publicat.";
  }
  if (cell.state === "expired")
    return "Anunțul a expirat pe portal — apasă „Publică” pentru a-l republica.";
  if (cell.state === "withdrawn") return "Nepublicat.";
  if (cell.state === "selected") return "Selectat — se trimite la următoarea apăsare pe „Publică”.";
  return "Nepublicat.";
}

const STATE_VIEW: Record<PropertyPortalCell["state"], { label: string; pill: StatusPillState }> = {
  coming_soon: { label: "Inactiv", pill: "inactive" },
  not_configured: { label: "Neconfigurat", pill: "inactive" },
  not_selected: { label: "Nepublicat", pill: "inactive" },
  selected: { label: "Selectat", pill: "pending" },
  syncing: { label: "Se sincronizează", pill: "pending" },
  published: { label: "Publicat", pill: "published" },
  in_feed: { label: "Publicat", pill: "published" },
  error: { label: "Refuzat", pill: "error" },
  expired: { label: "Expirat", pill: "pending" },
  withdrawn: { label: "Nepublicat", pill: "inactive" },
};

function operationLabel(operation: string): string {
  const labels: Record<string, string> = {
    publish: "Publicare",
    update: "Actualizare",
    withdraw: "Retragere",
    status: "Verificare",
    promote_on: "Promovare activată",
    promote_off: "Promovare dezactivată",
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
    assignedTo?: string | null;
    onCompleteMissing?: () => void;
    /** Deschide fila Poze (pentru „fără poze” în Catalogul Facebook). */
    onOpenMedia?: () => void;
    /** Starea de editare a paginii anunțului — butonul „Publică” e activ doar în editare. */
    editing?: boolean;
    /** Aceeași acțiune ca fostul buton din antet: salvează (în editare) și aplică bifele. */
    onPublish?: () => void;
    publishPending?: boolean;
  }
>(function PropertyPortalsCard({ organizationId, propertyId, assignedTo, onCompleteMissing, onOpenMedia, editing, onPublish, publishPending }, ref) {
  const queryClient = useQueryClient();
  const loadMatrix = useServerFn(getPropertiesPortalMatrix);
  const applyFn = useServerFn(applyPropertyPortalSelection);
  const queryKey = ["property-portals-selection", organizationId, propertyId] as const;

  const loadAutoWithdrawals = useServerFn(getPropertyAutoWithdrawals);
  const autoWithdrawals = useQuery({
    queryKey: ["property-auto-withdrawals", propertyId],
    queryFn: () => loadAutoWithdrawals({ data: { propertyId } }),
    refetchInterval: (q) =>
      q.state.data?.some((w) => w.status === "queued" || w.status === "running") ? 15_000 : false,
  });

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
  const requirementRows = requirements.data;
  const loadJournal = useServerFn(getPropertyPortalJournal);
  const journal = useQuery({
    queryKey: ["property-portal-journal", organizationId, propertyId] as const,
    queryFn: () =>
      loadJournal({ data: { ...(organizationId ? { organizationId } : {}), propertyId } }),
  });
  const requirementByPortal = useMemo(() => {
    type Report = NonNullable<typeof requirementRows>[number];
    const map = new Map<string, Report>();
    for (const item of requirementRows ?? []) map.set(item.portalId, item);
    return map;
  }, [requirementRows]);

  const cells = useMemo<PropertyPortalCell[]>(
    () => matrix.data?.properties[propertyId] ?? [],
    [matrix.data, propertyId],
  );
  const sessionUser = useCurrentUser().data;
  const loadMine = useServerFn(getMyPortalSlot);
  const slotQueries = useQueries({
    queries: cells.map((cell) => ({
      queryKey: ["my-portal-slot", cell.portalId],
      queryFn: () => loadMine({ data: { portalId: cell.portalId } }),
      retry: false,
      enabled: Boolean(assignedTo && assignedTo === sessionUser?.userId),
    })),
  });
  const canManage = matrix.data?.canManage ?? false;
  const contactBlock = matrix.data?.contactBlocks?.[propertyId] ?? null;

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

  /** Catalogul Facebook: același rând, aceeași bifă, aplicată prin „Publică”. */
  const loadFb = useServerFn(getPropertyFacebookCatalog);
  const saveFb = useServerFn(setPropertyFacebookCatalog);
  const fbKey = ["property-facebook-catalog", organizationId, propertyId] as const;
  const fb = useQuery({
    queryKey: fbKey,
    queryFn: () => loadFb({ data: { ...(organizationId ? { organizationId } : {}), propertyId } }),
  });
  const [fbChecked, setFbChecked] = useState<boolean | null>(null);
  useEffect(() => {
    if (fb.data) setFbChecked(fb.data.enabled);
  }, [fb.data]);
  const fbValue = fbChecked ?? fb.data?.enabled ?? false;
  const fbDirty = fb.data !== undefined && fbValue !== fb.data.enabled;
  const fbState = facebookListingState(fbValue, fb.data?.reason ?? null);
  const canEditFacebookCatalog = fb.data?.canEdit === true;

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [promotedChecked, setPromotedChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (cells.length === 0) return;
    setChecked(Object.fromEntries(cells.map((c) => [c.portalId, c.selected])));
    setPromotedChecked(Object.fromEntries(cells.map((c) => [c.portalId, c.promoted])));
  }, [cells]);

  /** „Promovat” e valabil doar cât timp „Publicat” e bifat. */
  const promotedValue = (c: PropertyPortalCell) =>
    c.promotionFlag &&
    effectivePromoted(checked[c.portalId] ?? c.selected, promotedChecked[c.portalId] ?? c.promoted);

  const dirty = cells.filter(
    (c) =>
      (checked[c.portalId] ?? c.selected) !== c.selected ||
      (c.promotionFlag && promotedValue(c) !== c.promoted),
  );
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
            .map((c) => ({
              portalId: c.portalId,
              enabled: checked[c.portalId] ?? c.selected,
              ...(c.promotionFlag ? { promoted: promotedValue(c) } : {}),
            })),
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
    if (!portalsActionable && !collabDirty && !fbDirty) return null;

    const results: PortalApplyResult[] = [];

    if (fbDirty && canEditFacebookCatalog) {
      try {
        await saveFb({
          data: { ...(organizationId ? { organizationId } : {}), propertyId, enabled: fbValue },
        });
        results.push({
          portalId: "facebook_catalog",
          portalName: "Catalog Facebook",
          ok: true,
          message: fbValue ? "Catalog Facebook: activat" : "Catalog Facebook: dezactivat",
        });
      } catch (e) {
        results.push({
          portalId: "facebook_catalog",
          portalName: "Catalog Facebook",
          ok: false,
          message: e instanceof Error ? e.message : "Catalog Facebook: salvarea a eșuat.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["property-facebook-catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["property-promotion"] });
      void queryClient.invalidateQueries({ queryKey: ["facebook-catalog-overview"] });
    }

    // Colaborarea se salvează separat de portaluri: o eroare aici nu blochează
    // publicarea pe portaluri, exact ca între portaluri.
    if (collabDirty) {
      const percent = collabPercent.trim() === "" ? null : Number(collabPercent);
      if (
        collabValue &&
        (Number.isNaN(percent) ||
          (percent === null &&
            (collabRow?.defaultCommissionPercent === null ||
              collabRow?.defaultCommissionPercent === undefined)))
      ) {
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
      void queryClient.invalidateQueries({ queryKey: ["property-collaboration", propertyId] });
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
    collabRow?.defaultCommissionPercent,
    fbDirty,
    fbValue,
    canEditFacebookCatalog,
    saveFb,
    organizationId,
    propertyId,
    saveCollab,
    queryClient,
  ]);

  useImperativeHandle(ref, () => ({ applyPending }), [applyPending]);

  if (matrix.isLoading || collab.isLoading)
    return <InlineLoading label="Se încarcă publicarea pe portaluri…" />;
  if (matrix.isError) return <QueryError error={matrix.error} onRetry={() => matrix.refetch()} />;
  // Nicio secțiune când agenției nu i-a fost activat niciun portal și nu participă la colaborare.
  // Catalogul Facebook e mereu disponibil, deci secțiunea apare mereu.

  const activeCount =
    cells.filter((c) => c.state === "published" || c.state === "in_feed").length +
    (collabVisible && collabRow?.enabled ? 1 : 0) +
    (fb.data?.enabled ? 1 : 0);
  const totalRows = cells.length + (collabVisible ? 1 : 0) + 1;
  const pendingCount =
    (canManage ? actionable.length : 0) + (collabDirty ? 1 : 0) + (fbDirty ? 1 : 0);

  const allRequired = Array.from(
    new Map(
      (requirementRows ?? [])
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
            <div className="flex flex-col items-end gap-1 max-sm:w-full max-sm:items-stretch">
              {pendingCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {pendingCount} {pendingCount === 1 ? "modificare" : "modificări"} de aplicat
                </span>
              ) : null}
              {onPublish ? (
                <>
                  <Button
                    onClick={onPublish}
                    disabled={!editing || publishPending}
                    title={editing ? undefined : "Apasă Editează pentru a publica."}
                    className="max-sm:w-full"
                  >
                    {publishPending ? "Se publică…" : "Publică"}
                  </Button>
                  {!editing ? (
                    <span className="text-xs text-muted-foreground sm:hidden">
                      Apasă Editează pentru a publica.
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
          </header>

          {contactBlock ? (
            <ContactBlockNotice
              message={contactBlock}
              isAdmin={sessionUser?.isAdmin === true}
              className="mb-3 rounded-2xl border border-destructive bg-destructive/5 p-3 text-sm"
            />
          ) : null}
          <ul className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
            <li className="min-w-0">
              <Card className={cn("relative min-w-0 bg-surface p-4 text-sm", fbValue && "border-gold ring-1 ring-gold/40", fbState.key === "excluded" && "bg-warning/10")}>
                <label htmlFor="portal-facebook-catalog" aria-label="Catalog Facebook" className={cn("absolute inset-0 z-0", editing && canManage && canEditFacebookCatalog && !fb.isLoading ? "cursor-pointer" : "cursor-default")} />
                <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 pointer-events-none">
                  <div className="flex min-w-0 items-start gap-3">
                    <PortalLogo portalId="facebook_catalog" name="Catalog Facebook" fallback="FB" size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[17px] font-bold leading-6">Catalog Facebook</p>
                      <StatusPill
                        state={fbState.key === "in_catalog" ? "published" : fbState.key === "excluded" ? "pending" : "inactive"}
                        dot
                      >
                        {fbState.label}
                      </StatusPill>
                    </div>
                  </div>
                  <Checkbox
                    id="portal-facebook-catalog"
                    checked={fbValue}
                    disabled={!editing || !canManage || !canEditFacebookCatalog || fb.isLoading}
                    aria-label="Catalog Facebook"
                    className="pointer-events-auto mt-0.5 size-6 rounded-full disabled:opacity-40 [&_svg]:size-4"
                    onCheckedChange={(next) => setFbChecked(next === true)}
                  />
                </div>
                <div className="relative z-10 mt-3 min-w-0 pointer-events-none">
                    <p className="text-xs text-muted-foreground">
                      {!canEditFacebookCatalog
                        ? "Doar managerul agenției poate adăuga anunțuri în Catalog Facebook."
                        : fbDirty
                          ? "Se aplică la următoarea apăsare pe „Publică”."
                        : fbState.key === "in_catalog"
                          ? "Apare în feedul citit de Meta."
                          : fbState.key === "excluded"
                            ? "Nu apare în feed până nu completezi datele lipsă."
                            : "Nu intră în Catalogul Facebook."}
                    </p>
                    {fbValue && fbState.reason ? (
                      <p className="mt-1 text-xs">
                        {FACEBOOK_LISTING_FIX[fbState.reason].hint}{" "}
                        <Button
                          type="button"
                          variant="link"
                          size="compact"
                          className="pointer-events-auto h-auto p-0 font-semibold"
                          onClick={() =>
                            fbState.reason && FACEBOOK_LISTING_FIX[fbState.reason].target === "media"
                              ? onOpenMedia?.()
                              : onCompleteMissing?.()
                          }
                        >
                          Completează
                        </Button>
                      </p>
                    ) : null}
                </div>
              </Card>
            </li>
            {collabVisible ? (
              <li className="min-w-0">
                <Card
                  className={cn(
                    "relative min-w-0 bg-surface p-4 text-sm",
                    collabValue && "border-gold ring-1 ring-gold/40",
                    collabValue &&
                      collabPercent.trim() === "" &&
                      (collabRow?.defaultCommissionPercent === null ||
                        collabRow?.defaultCommissionPercent === undefined) &&
                      "bg-warning/10",
                  )}
                >
                  <label htmlFor="portal-habitoo-collaboration" aria-label="Colaborare Habitoo" className={cn("absolute inset-0 z-0", editing && canManage ? "cursor-pointer" : "cursor-default")} />
                  <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 pointer-events-none">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-surface">
                        <BrandLogo markOnly className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-[17px] font-bold leading-6">Colaborare Habitoo</p>
                        <StatusPill state={collabValue ? "published" : "inactive"} dot>
                          {collabValue ? "Activ" : "Inactiv"}
                        </StatusPill>
                      </div>
                    </div>
                    <Checkbox
                      id="portal-habitoo-collaboration"
                      checked={collabValue}
                      disabled={!editing || !canManage}
                      aria-label="Colaborare Habitoo"
                      className="pointer-events-auto mt-0.5 size-6 rounded-full disabled:opacity-40 [&_svg]:size-4"
                      onCheckedChange={(next) => setCollabChecked(next === true)}
                    />
                  </div>
                  <div className="relative z-10 mt-3 pointer-events-none">
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
                  {collabValue ? (
                    <div className="relative z-10 mt-3 min-w-0 space-y-3 pointer-events-auto">
                      <div className="min-w-0 space-y-1.5">
                        <Label htmlFor="collab-percent" className="text-xs">
                          Comision oferit (%)
                        </Label>
                        <Input
                          id="collab-percent"
                          inputMode="decimal"
                          disabled={!editing || !canManage}
                          placeholder={
                            collabRow?.defaultCommissionPercent !== null &&
                            collabRow?.defaultCommissionPercent !== undefined
                              ? `Standard agenție: ${collabRow.defaultCommissionPercent}%`
                              : "Ex. 1.5"
                          }
                          value={collabPercent}
                          onChange={(e) => setCollabPercent(e.target.value)}
                        />
                        {collabPercent.trim() === "" &&
                        collabRow?.defaultCommissionPercent !== null &&
                        collabRow?.defaultCommissionPercent !== undefined ? (
                          <p className="text-xs text-muted-foreground">
                            Lasă gol pentru comisionul standard.
                          </p>
                        ) : collabPercent.trim() === "" ? (
                          <p className="text-xs text-warning-foreground">
                            Obligatoriu cât timp colaborarea este activă. Setează un standard în{" "}
                            <Link
                              to="/app/settings"
                              search={{ tab: "agency" }}
                              className="font-semibold underline"
                            >
                              Setări → Agenție
                            </Link>
                            .
                          </p>
                        ) : null}
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <Label htmlFor="collab-terms" className="text-xs">
                          Condiții (opțional)
                        </Label>
                        <Textarea
                          id="collab-terms"
                          rows={2}
                          disabled={!editing || !canManage}
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

            {cells.map((cell, index) => {
              const value = checked[cell.portalId] ?? cell.selected;
              const slot = slotQueries[index]?.data;
              const noSlots = !value && !cell.selected && Boolean(slot && (slot.remaining === 0 || slot.agencyExhausted));
              const disabled =
                !editing ||
                !canManage ||
                cell.availability !== "available" ||
                !cell.configured ||
                noSlots ||
                apply.isPending ||
                (Boolean(contactBlock) && !value && !cell.selected);
              const problem =
                cell.state === "error" ||
                Boolean(cell.lastError) ||
                (cell.availability === "available" && value && !cell.configured);
              const stateView = STATE_VIEW[cell.state];
              const failure = latestFailureByPortal.get(cell.portalId);
              const detail = stateSentence(cell, value);

              return (
                <li key={cell.portalId} className="min-w-0">
                  <Card className={cn("relative min-w-0 bg-surface p-4 text-sm", value && "border-gold ring-1 ring-gold/40", !cell.configured && "opacity-55")}>
                    {cell.configured ? <label htmlFor={`portal-${cell.portalId}`} aria-label={cell.portalName} className={cn("absolute inset-0 z-0", !disabled ? "cursor-pointer" : "cursor-default")} /> : null}
                    <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 pointer-events-none">
                      <div className="flex min-w-0 items-start gap-3">
                        <PortalLogoStack portalId={cell.portalId} name={cell.portalName} size={40} />
                        <div className="min-w-0">
                          <p className="break-words text-[17px] font-bold leading-6">{cell.portalName}</p>
                          <StatusPill state={stateView.pill} dot>{stateView.label}</StatusPill>
                        </div>
                      </div>
                      {cell.configured ? <Checkbox
                        id={`portal-${cell.portalId}`}
                        checked={value}
                        disabled={disabled}
                        aria-label={cell.portalName}
                        className="pointer-events-auto mt-0.5 size-6 rounded-full disabled:opacity-40 [&_svg]:size-4"
                        onCheckedChange={(next) => {
                          if (next === true && cell.availability === "available" && !cell.configured) {
                            toast.error(`${cell.portalName} nu este configurat. Configurează portalul în Setări.`);
                          }
                          setChecked((prev) => ({ ...prev, [cell.portalId]: next === true }));
                          if (next !== true) setPromotedChecked((prev) => ({ ...prev, [cell.portalId]: false }));
                        }}
                      /> : null}
                    </div>
                    <div className="relative z-10 mt-3 min-w-0 pointer-events-none">
                      {!cell.configured ? <p className="text-xs text-muted-foreground">Agenția nu l-a conectat încă</p> : null}
                        <p
                          className={cn(
                            "mt-1 text-xs",
                            problem ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {detail}
                          {problem && failure?.requestId ? ` · Cerere ${failure.requestId}` : ""}
                        </p>
                        {contactBlock && value && FEED_PORTALS_REQUIRING_AGENT_PHONE.has(cell.portalId) ? (
                          <p className="mt-1 text-xs font-semibold text-destructive">
                            {FEED_EXCLUDED_NO_PHONE}
                          </p>
                        ) : null}
                        {cell.portalId === "oferteimobiliare" ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            OferteImobiliare afișează telefonul contului agenției.
                          </p>
                        ) : null}
                        {slot?.allocated !== null && slot?.allocated !== undefined ? (
                          <p className="mt-2 text-xs text-muted-foreground">{slot.used} din {slot.allocated} sloturi{slot.agencyExhausted ? " — agenția nu mai are locuri libere." : ""}</p>
                        ) : null}
                        {noSlots ? <p className="mt-1 text-xs font-medium text-warning-foreground">{slot?.agencyExhausted ? "Agenția nu mai are locuri libere." : "Nu mai ai locuri libere de publicare pe acest portal."}</p> : null}
                        <AutoWithdrawLine
                          view={autoWithdrawals.data?.find((w) => w.portalId === cell.portalId)}
                        />
                      <div className="relative z-10 mt-3 flex min-w-0 flex-wrap items-center gap-2 [&>*]:pointer-events-auto">
                        {(cell.portalId === "imobiliare_ro" || cell.portalId === "romimo") &&
                        cell.offerLinks.length > 0 &&
                        !cell.publicWarning ? (
                          cell.offerLinks.map((link) => (
                            <Button key={link.url} variant="link" size="compact" asChild>
                              <a href={link.url} target="_blank" rel="noopener noreferrer">
                                Vezi anunțul
                                {link.label
                                  ? ` (${link.label})`
                                  : cell.offerLinks.length > 1
                                    ? link.transaction === "rent"
                                      ? " (închiriere)"
                                      : " (vânzare)"
                                    : ""}{" "}
                                <ExternalLink aria-hidden />
                              </a>
                            </Button>
                          ))
                        ) : cell.publicUrl && !cell.publicWarning && cell.portalId !== "imobiliare_ro" ? (
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
                        {cell.promotionFlag ? (
                          <label
                            htmlFor={`portal-${cell.portalId}-promoted`}
                            className={cn(
                              "inline-flex items-center gap-2 text-xs",
                              !value && "text-muted-foreground",
                            )}
                          >
                            <Checkbox
                              id={`portal-${cell.portalId}-promoted`}
                              checked={promotedValue(cell)}
                              disabled={disabled || !value}
                              aria-label={`Promovat pe ${cell.portalName}`}
                              onCheckedChange={(next) =>
                                setPromotedChecked((prev) => ({
                                  ...prev,
                                  [cell.portalId]: next === true,
                                }))
                              }
                            />
                            Promovat
                          </label>
                        ) : null}
                      </div>
                    </div>

                    {/* Anunț trimis, dar pagina publică nu funcționează (cont fără abonament). */}
                    {cell.publicWarning ? (
                      <p className="pointer-events-none relative z-10 mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                        {cell.publicWarning}
                      </p>
                    ) : null}

                    {/* Validare pre-publicare: ce lipsește, în cuvinte, pe acest portal. */}
                    {value && (requirementByPortal.get(cell.portalId)?.missing.length ?? 0) > 0 ? (
                      <div className="pointer-events-none relative z-10 mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 pl-3 text-xs">
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

const AUTO_REASON_LABEL: Record<AutoWithdrawView["reason"], string> = {
  status_sold: "Vândut",
  status_rented: "Închiriat",
  archived: "Arhivat",
  deleted: "Șters",
};

/** Starea retragerii automate (Vândut / Închiriat / Arhivat) pe acest portal. */
function AutoWithdrawLine({ view }: { view: AutoWithdrawView | undefined }) {
  if (!view || view.status === "cancelled") return null;
  const reason = AUTO_REASON_LABEL[view.reason];
  const date = new Date(view.finishedAt ?? view.createdAt).toLocaleString("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  if (view.status === "queued" || view.status === "running")
    return (
      <p className="mt-1 text-xs text-warning-foreground">
        Retragere automată în curs (motiv: {reason})
        {view.attempts > 0 ? ` · încercarea ${view.attempts + 1}` : ""}
        {view.lastError ? ` · ultima eroare: ${view.lastError}` : ""}
      </p>
    );
  if (view.status === "done")
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        Retras automat la {date}, motiv: {reason}
      </p>
    );
  if (view.status === "manual_required")
    return (
      <p className="mt-1 text-xs font-medium text-warning-foreground">
        Motiv: {reason} — trebuie retras manual din contul portalului
      </p>
    );
  return (
    <p className="mt-1 text-xs text-destructive">
      Retragere automată eșuată la {date} (motiv: {reason}): {view.lastError ?? "eroare"}.
      Retrage manual oferta.
    </p>
  );
}
