/**
 * Hub-ul de portaluri imobiliare (Superadmin → Portaluri), per agenție.
 * UI generic: totul vine din registry, nimic nu este hardcodat pentru un portal.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  PlugZap,
  Save,
  Trash2,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  disconnectPortal,
  getImobiliareAccountStatus,
  getPortalHub,
  issuePortalApiKey,
  previewPortalFeed,
  revokePortalApiKey,
  savePortalConnection,
  setPortalActivation,
  testPortalConnection,
  type PortalHubItem,
} from "@/lib/portals.functions";
import { portalGridState, type PortalGridTone } from "@/lib/portals/grid-state";
import {
  revokeStoriaAuthorization,
  startStoriaAuthorization,
} from "@/lib/portals/storia.functions";
import {
  getStoriaTaxonomyState,
  refreshStoriaTaxonomy,
} from "@/lib/portals/storia-taxonomy.functions";

import {
  PORTAL_AUTH_LABEL,
  PORTAL_AVAILABILITY_LABEL,
  PORTAL_CAPABILITY_LABEL,
  PORTAL_CONNECTION_LABEL,
  PORTAL_DIRECTION_LABEL,
  portalDisplayName,
  validatePortalConfigValues,
  type PortalAuthenticationMode,
  type PortalDirection,
} from "@/lib/portals/registry";

/**
 * Starea abonamentului Imobiliare.ro, lângă starea conexiunii. Fără abonament
 * activ, anunțurile rămân „online” în cont, dar nu sunt publice pe site.
 */
function ImobiliareSubscriptionBadge({ organizationId }: { organizationId: string }) {
  const load = useServerFn(getImobiliareAccountStatus);
  const account = useQuery({
    queryKey: ["imobiliare-account", organizationId] as const,
    queryFn: () => load({ data: { organizationId } }),
    staleTime: 10 * 60 * 1000,
  });
  const data = account.data;
  if (!data || data.isSubscriptionActive === null) return null;
  const details = [
    data.subscriptionType ? `tip ${data.subscriptionType}` : null,
    data.listingOnlineCount !== null ? `${data.listingOnlineCount} anunțuri online` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <StatusBadge tone={data.isSubscriptionActive ? "success" : "warning"}>
      {data.isSubscriptionActive ? "Abonament activ" : "Fără abonament activ"}
      {details ? ` · ${details}` : ""}
    </StatusBadge>
  );
}

/** Punctul colorat din linia de stare a cardului din grilă. */
const GRID_DOT_CLASS: Record<PortalGridTone, string> = {
  success: "bg-success",
  danger: "bg-destructive",
  muted: "bg-muted-foreground/50",
};

export function PortalsCard({ organizationId }: { organizationId: string }) {
  const hubKey = ["portal-hub", organizationId] as const;
  const queryClient = useQueryClient();
  const loadHub = useServerFn(getPortalHub);
  const runSave = useServerFn(savePortalConnection);
  const runTest = useServerFn(testPortalConnection);
  const runDisconnect = useServerFn(disconnectPortal);
  const runIssueKey = useServerFn(issuePortalApiKey);
  const runRevokeKey = useServerFn(revokePortalApiKey);
  const runPreview = useServerFn(previewPortalFeed);
  const runActivation = useServerFn(setPortalActivation);
  const runStartOAuth = useServerFn(startStoriaAuthorization);
  const runRevokeOAuth = useServerFn(revokeStoriaAuthorization);
  const loadTaxonomy = useServerFn(getStoriaTaxonomyState);
  const runRefreshTaxonomy = useServerFn(refreshStoriaTaxonomy);

  const [accountId, setAccountId] = useState<Record<string, string>>({});
  const [credential, setCredential] = useState<Record<string, string>>({});
  const [endpoint, setEndpoint] = useState<Record<string, string>>({});
  // Credențialele rămân mascate implicit; dezvăluirea se face la cerere, per câmp.
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const [keyLabel, setKeyLabel] = useState<Record<string, string>>({});
  const [freshKey, setFreshKey] = useState<{
    portalId: string;
    key: string;
    feedUrl: string | null;
  } | null>(null);

  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  // Portalul selectat din grilă: configurația lui se deschide dedesubt.
  // Selecția se păstrează la navigare înapoi (per agenție).
  const selectedStorageKey = `habitoo:portals-selected:${organizationId}`;
  const [selected, setSelected] = useState<string>("");
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setSelected(window.sessionStorage.getItem(selectedStorageKey) ?? "");
    } catch {
      setSelected("");
    }
  }, [selectedStorageKey]);

  const persistSelected = (portalId: string) => {
    setSelected(portalId);
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(selectedStorageKey, portalId);
    } catch {
      /* sesiunea nu poate fi scrisă — starea rămâne doar în pagină */
    }
  };
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [feedPreview, setFeedPreview] = useState<Awaited<
    ReturnType<typeof previewPortalFeed>
  > | null>(null);

  const hub = useQuery({ queryKey: hubKey, queryFn: () => loadHub({ data: { organizationId } }) });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: hubKey });
  };

  const save = useMutation({
    mutationFn: (input: { portalId: string }) => {
      const values = {
        externalAccountId: accountId[input.portalId]?.trim(),
        credential: credential[input.portalId]?.trim() || undefined,
        endpointUrl: endpoint[input.portalId]?.trim(),
      };
      // Formatele cerute de portal (ex. email) se semnalează înainte de salvare.
      const formatError = validatePortalConfigValues(input.portalId, values);
      if (formatError) throw new Error(formatError);
      return runSave({ data: { organizationId, portalId: input.portalId, ...values } });
    },


    onSuccess: (_r, input) => {
      setCredential((prev) => ({ ...prev, [input.portalId]: "" }));
      invalidate();
      toast.success("Configurarea portalului a fost salvată.");
    },
    onError: (e: Error) => toastError(e),
  });

  /** Activarea comercială a portalului pentru agenție (separat de conexiune). */
  const activation = useMutation({
    mutationFn: (input: { portalId: string; activated: boolean }) =>
      runActivation({
        data: { organizationId, portalId: input.portalId, activated: input.activated },
      }),
    onSuccess: (res) => {
      invalidate();
      // Starea cererii de activare se reflectă pe cardul din grilă.
      queryClient.invalidateQueries({ queryKey: ["portal-activation-requests"] });
      toast.success(
        res.activated
          ? "Portalul este activat pentru agenție: își poate publica singură ofertele."
          : "Portalul a fost dezactivat pentru agenție.",
      );
    },
    onError: (e: Error) => toastError(e),
  });

  /**
   * Autorizarea OAuth a contului agenției: browserul pleacă spre portal, iar
   * returnarea este procesată de ruta publică de callback.
   */
  const startOAuth = useMutation({
    mutationFn: (_portalId: string) => runStartOAuth({ data: { organizationId } }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (e: Error) => toastError(e),
  });

  /**
   * Taxonomia Storia se citește din cache (o descărcare pe zi este suficientă),
   * nu la fiecare publicare. Butonul de mai jos o reîmprospătează manual.
   */
  const taxonomyKey = ["storia-taxonomy"] as const;
  const taxonomy = useQuery({ queryKey: taxonomyKey, queryFn: () => loadTaxonomy({}) });
  const refreshTaxonomy = useMutation({
    mutationFn: () => runRefreshTaxonomy({ data: { organizationId } }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: taxonomyKey });
      if (res.ok) {
        toast.success(
          `Taxonomia Storia a fost actualizată: ${res.cache?.categoryCount ?? 0} categorii.`,
        );
      } else {
        toast.error(res.error);
      }
    },
    onError: (e: Error) => toastError(e),
  });

  const revokeOAuth = useMutation({
    mutationFn: (_portalId: string) => runRevokeOAuth({ data: { organizationId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Autorizarea a fost desfăcută. Agenția trebuie să reconecteze contul.");
    },
    onError: (e: Error) => toastError(e),
  });

  const test = useMutation({
    mutationFn: (portalId: string) => runTest({ data: { organizationId, portalId } }),
    onSuccess: (res) => {
      invalidate();
      if (res.ok) {
        const feed = res.feed;
        toast.success(
          feed
            ? `Feed verificat: ${feed.properties ?? 0} oferte, ${feed.agents ?? 0} agenți, ${feed.activeKeys ?? 0} chei active.`
            : res.live
              ? "Conexiunea a fost verificată cu portalul."
              : "Configurarea este completă. Trimiterile reale sunt încă oprite (mod simulare).",
        );
      } else {
        toast.error(res.message);
      }
    },
    onError: (e: Error) => toastError(e),
  });

  const disconnect = useMutation({
    mutationFn: (portalId: string) => runDisconnect({ data: { organizationId, portalId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Portalul a fost deconectat, iar cheile emise au fost revocate.");
    },
    onError: (e: Error) => toastError(e),
  });

  const issueKey = useMutation({
    mutationFn: (portalId: string) =>
      runIssueKey({
        data: { organizationId, portalId, label: keyLabel[portalId]?.trim() || "Cheie portal" },
      }),
    onSuccess: (res, portalId) => {
      setKeyLabel((prev) => ({ ...prev, [portalId]: "" }));
      setFreshKey({ portalId, key: res.key, feedUrl: res.feedUrl ?? null });

      invalidate();
    },
    onError: (e: Error) => toastError(e),
  });

  const revokeKey = useMutation({
    mutationFn: (keyId: string) => runRevokeKey({ data: { organizationId, keyId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Cheia a fost revocată.");
    },
    onError: (e: Error) => toastError(e),
  });

  // Previzualizare read-only: arată exact ce oferte ar citi portalul acum.
  const preview = useMutation({
    mutationFn: (portalId: string) => runPreview({ data: { organizationId, portalId, limit: 3 } }),
    onSuccess: (res) => {
      setFeedPreview(res);
      toast.success(`${res.valid} oferte valide din ${res.selected} selectate.`);
    },
    onError: (e: Error) => toastError(e),
  });

  const copy = async (value: string, message = "Copiat.") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Copierea nu a funcționat. Selectează manual textul.");
    }
  };

  /** Clic pe cardul din grilă: deschide configurarea portalului dedesubt. */
  const select = (portalId: string) => {
    if (portalId === selected) return;
    const current = (hub.data ?? []).find((i) => i.portal.id === selected);
    const currentDirty = current
      ? (credential[selected]?.trim() ?? "") !== "" ||
        (accountId[selected] !== undefined &&
          accountId[selected] !== (current.connection.externalAccountId ?? "")) ||
        (endpoint[selected] !== undefined &&
          endpoint[selected] !== (current.connection.endpointUrl ?? ""))
      : false;
    if (currentDirty) {
      setConfirmSwitch(portalId);
      return;
    }
    persistSelected(portalId);
  };

  if (hub.isLoading) return <InlineLoading label="Se încarcă portalurile…" />;
  if (hub.isError) return <QueryError error={hub.error} onRetry={() => hub.refetch()} />;

  return (
    <div className="space-y-4">
      {/* Grila de portaluri: bifa activează pentru agenție, clicul deschide configurarea. */}
      <section className="panel overflow-hidden">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Portaluri</h2>
          <p className="text-xs text-muted-foreground">
            Bifează portalul ca să-l activezi pentru agenție. Apar doar portalurile deja integrate
            în Habitoo.
          </p>
        </header>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {(hub.data ?? [])
            .filter((item) => item.portal.status === "available")
            .map((item) => {
              const name = portalDisplayName(item.portal.id);
              const state = portalGridState({
                connectionStatus: item.connection.status,
              });
              const isSelected = item.portal.id === selected;
              return (
                <div
                  key={item.portal.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => select(item.portal.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      select(item.portal.id);
                    }
                  }}
                  className={cn(
                    "panel cursor-pointer p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                    isSelected ? "border-gold ring-2 ring-gold/40" : "",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <PortalLogoStack
                      portalId={item.portal.id}
                      name={name}
                      size={40}
                      className="shrink-0"
                    />
                    <Checkbox
                      checked={item.connection.activated}
                      disabled={activation.isPending}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          activation.mutate({ portalId: item.portal.id, activated: true });
                        } else {
                          setConfirmDeactivate(item.portal.id);
                        }
                      }}
                      aria-label={`Activează ${name} pentru agenție`}
                    />
                  </div>
                  <h3 className="mt-3 text-[17px] leading-6 font-bold break-words">{name}</h3>
                  <div data-portal-statuses className="mt-1 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 rounded-full", GRID_DOT_CLASS[state.tone])}
                      />
                      {state.label}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      {/* Configurarea portalului selectat: exact mecanismul existent, neschimbat. */}
      {(hub.data ?? [])
        .filter((item) => item.portal.status === "available" && item.portal.id === selected)
        .map((item) => {
          const badge = PORTAL_CONNECTION_LABEL[item.connection.status];
          const unavailable = item.portal.status !== "available";
          const activeKeys = item.keys.filter((k) => k.status === "active");
          // Un portal cu erori rămâne evidențiat, ca să nu fie ratat.
          const hasError =
            item.connection.status === "error" || Boolean(item.connection.lastSyncError);
          // Modificări tastate, dar nesalvate — blochează comutarea silențioasă.
          const dirty =
            (credential[item.portal.id]?.trim() ?? "") !== "" ||
            (accountId[item.portal.id] !== undefined &&
              accountId[item.portal.id] !== (item.connection.externalAccountId ?? "")) ||
            (endpoint[item.portal.id] !== undefined &&
              endpoint[item.portal.id] !== (item.connection.endpointUrl ?? ""));
          return (
            <div
              key={item.portal.id}
              className={
                hasError ? "panel border-destructive/50 ring-1 ring-destructive/20" : "panel"
              }
            >
            <div className="grid grid-cols-[minmax(0,1fr)_40px] items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
              <div className="flex min-w-0 items-start gap-3">
                <PortalLogoStack
                  portalId={item.portal.id}
                  name={portalDisplayName(item.portal.id)}
                  size={40}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[17px] leading-6 font-bold break-words">
                    {portalDisplayName(item.portal.id)}
                  </h3>
                  <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                    {item.feedOnly ? "Prin feed · " : ""}
                    {item.connection.lastSyncAt
                      ? `Verificat: ${formatDateTime(item.connection.lastSyncAt)}`
                      : "Neverificat încă"}
                  </p>
                </div>
              </div>
              {item.portal.website ? (
                <a
                  href={item.portal.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex size-10 shrink-0 items-center justify-center rounded-control border border-border text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={`Deschide ${portalDisplayName(item.portal.id)} într-o filă nouă`}
                >
                  <ExternalLink className="size-5" />
                </a>
              ) : <span aria-hidden />}
            </div>

            <div data-portal-statuses className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
              {unavailable ? (
                <StatusBadge className="h-7 text-[13px]" tone="neutral">
                  {PORTAL_AVAILABILITY_LABEL[item.portal.status]}
                </StatusBadge>
              ) : (
                <>
                  <StatusBadge
                    className={
                      item.connection.status === "connected"
                        ? "h-7 border-success bg-success text-[13px] text-success-foreground"
                        : "h-7 text-[13px]"
                    }
                    tone={badge.tone}
                    dot
                  >
                    {badge.label}
                  </StatusBadge>
                  <StatusBadge
                    className={
                      item.connection.activated
                        ? "h-7 border-success bg-card text-[13px] text-success"
                        : "h-7 border-neutral/25 bg-card text-[13px] text-neutral"
                    }
                    tone="neutral"
                  >
                    {item.connection.activated ? <Check className="size-3.5" aria-hidden /> : null}
                    {item.connection.activated ? "Activat pentru agenție" : "Neactivat"}
                  </StatusBadge>
                  {item.portal.id === "imobiliare_ro" && item.connection.hasPortalCredential ? (
                    <ImobiliareSubscriptionBadge organizationId={organizationId} />
                  ) : null}
                </>
              )}
              {dirty ? <StatusBadge className="h-7 text-[13px]" tone="warning">Modificări nesalvate</StatusBadge> : null}
            </div>

            {hasError && item.connection.lastSyncError ? (
              <p className="px-4 pb-4 text-sm break-words text-destructive sm:px-5">{item.connection.lastSyncError}</p>
            ) : null}

            {
              <div className="space-y-4 border-t border-border p-5">
                <p className="text-sm text-muted-foreground">{item.portal.description}</p>

                {unavailable ? (
                  <p className="text-sm text-muted-foreground">
                    Integrarea va fi activată după ce portalul confirmă accesul și documentația.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {item.portal.directions.map((d) => (
                        <StatusBadge key={d} tone="info">
                          {PORTAL_DIRECTION_LABEL[d as PortalDirection]}
                        </StatusBadge>
                      ))}
                      {item.portal.authentication.map((a) => (
                        <StatusBadge key={a} tone="neutral">
                          {PORTAL_AUTH_LABEL[a as PortalAuthenticationMode]}
                        </StatusBadge>
                      ))}
                    </div>

                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Oferte publicabile</dt>
                        <dd>{item.eligibleProperties}</dd>
                      </div>
                      {item.feedOnly ? (
                        <div>
                          <dt className="text-muted-foreground">Oferte selectate pentru portal</dt>
                          <dd>{item.feed.selected ?? 0}</dd>
                        </div>
                      ) : (
                        <>
                          <div>
                            <dt className="text-muted-foreground">Oferte trimise către portal</dt>
                            <dd>
                              {item.listings.published} trimise · {item.listings.failed} cu eroare
                            </dd>
                          </div>
                          {item.hasConnectionFields ? (
                          <div>
                            <dt className="text-muted-foreground">Credențiale portal</dt>
                            <dd>
                              {item.connection.hasPortalCredential
                                ? "Salvate și criptate"
                                : "Nesalvate"}
                            </dd>
                          </div>
                          ) : null}
                        </>
                      )}
                      <div>
                        <dt className="text-muted-foreground">Ultima verificare</dt>
                        <dd>
                          {item.connection.lastSyncAt
                            ? formatDateTime(item.connection.lastSyncAt)
                            : "Niciodată"}
                        </dd>
                      </div>
                    </dl>

                    <dl className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">Oferte în feed</dt>
                        <dd>{item.feed.properties ?? 0}</dd>
                      </div>
                      {item.feedOnly ? (
                        <div>
                          <dt className="text-muted-foreground">
                            Oferte excluse (date incomplete)
                          </dt>
                          <dd>{item.feed.excluded ?? 0}</dd>
                        </div>
                      ) : (
                        <div>
                          <dt className="text-muted-foreground">Agenți în feed</dt>
                          <dd>{item.feed.agents ?? 0}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-muted-foreground">Feed</dt>
                        <dd>
                          {item.feed.ok ? (item.feed.apiVersion ?? "funcțional") : "indisponibil"}
                        </dd>
                      </div>
                    </dl>

                    {item.connection.lastSyncError ? (
                      <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                        {item.connection.lastSyncError}
                      </p>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {item.portal.configuration_schema.fields.map((field) => {
                        const value =
                          field.target === "external_account_id"
                            ? (accountId[item.portal.id] ?? item.connection.externalAccountId ?? "")
                            : field.target === "credentials"
                              ? (credential[item.portal.id] ?? "")
                              : (endpoint[item.portal.id] ?? item.connection.endpointUrl ?? "");
                        const setValue = (next: string) => {
                          if (field.target === "external_account_id") {
                            setAccountId((prev) => ({ ...prev, [item.portal.id]: next }));
                          } else if (field.target === "credentials") {
                            setCredential((prev) => ({ ...prev, [item.portal.id]: next }));
                          } else {
                            setEndpoint((prev) => ({ ...prev, [item.portal.id]: next }));
                          }
                        };
                        const fieldId = `${item.portal.id}-${field.key}`;
                        const isRevealed = revealed[fieldId] === true;
                        return (
                          <div key={field.key} className="space-y-1.5">
                            <Label htmlFor={fieldId}>{field.label}</Label>
                            <div className="relative">
                              <Input
                                id={fieldId}
                                type={field.secret && !isRevealed ? "password" : "text"}
                                autoComplete="off"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                className={field.secret ? "pr-10" : undefined}
                                placeholder={
                                  field.secret && item.connection.hasPortalCredential
                                    ? "Salvat — completează pentru a-l înlocui"
                                    : (field.placeholder ?? "")
                                }
                              />
                              {field.secret ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealed((prev) => ({ ...prev, [fieldId]: !isRevealed }))
                                  }
                                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  aria-label={isRevealed ? "Ascunde valoarea" : "Arată valoarea"}
                                >
                                  {isRevealed ? (
                                    <EyeOff className="size-4" />
                                  ) : (
                                    <Eye className="size-4" />
                                  )}
                                </button>
                              ) : null}
                            </div>
                            {field.help ? (
                              <p className="text-xs text-muted-foreground">{field.help}</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {item.oauth ? (
                      <div className="space-y-3 rounded-lg border border-border p-3">
                        <div>
                          <p className="text-sm font-medium">
                            Contul {portalDisplayName(item.portal.id)} al agenției
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {portalDisplayName(item.portal.id)} nu folosește o cheie API a agenției. Agenția
                            își autorizează contul o singură dată, iar Habitoo păstrează autorizarea
                            criptat și o reînnoiește automat.
                          </p>
                        </div>

                        {item.oauth.reconnectRequired ? (
                          <p
                            role="alert"
                            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive"
                          >
                            Reconectează contul Storia: autorizarea nu mai poate fi reînnoită automat.
                          </p>
                        ) : null}

                        {item.oauth.appConfigured ? null : (
                          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                            Credențialele de aplicație pentru {portalDisplayName(item.portal.id)} nu sunt
                            încă configurate în platformă. Conectarea nu poate porni.
                          </p>
                        )}

                        <dl className="grid gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">Autorizare</dt>
                            <dd>
                              {item.oauth.reconnectRequired
                                ? "Necesită reconectare"
                                : !item.oauth.connected
                                ? "Neconectat"
                                : item.oauth.expired
                                  ? item.oauth.canRefresh
                                    ? "Token expirat — se reînnoiește automat"
                                    : "Token expirat — reia conectarea"
                                  : "Activă"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Conectat la</dt>
                            <dd>
                              {item.oauth.connectedAt
                                ? formatDateTime(item.oauth.connectedAt)
                                : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Token valabil până la</dt>
                            <dd>
                              {item.oauth.expiresAt ? formatDateTime(item.oauth.expiresAt) : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Ultima reînnoire</dt>
                            <dd>
                              {item.oauth.refreshedAt
                                ? formatDateTime(item.oauth.refreshedAt)
                                : "—"}
                            </dd>
                          </div>
                        </dl>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            onClick={() => startOAuth.mutate(item.portal.id)}
                            disabled={startOAuth.isPending || item.oauth?.appConfigured !== true}
                          >
                            <ExternalLink className="mr-2 size-4" />
                            {item.oauth.reconnectRequired
                              ? "Reconectează contul Storia"
                              : item.oauth.connected
                              ? "Reconectează contul"
                              : `Conectează contul ${portalDisplayName(item.portal.id)}`}
                          </Button>
                          {item.oauth.connected ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => revokeOAuth.mutate(item.portal.id)}
                              disabled={revokeOAuth.isPending}
                            >
                              <Unplug className="mr-2 size-4" />
                              Desface autorizarea
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {item.portal.id === "storia" ? (
                      <div className="space-y-3 rounded-lg border border-border p-3">
                        <div>
                          <p className="text-sm font-medium">Structura de categorii Storia</p>
                          <p className="text-xs text-muted-foreground">
                            Habitoo trimite doar câmpurile confirmate de Storia. Reîmprospătează
                            lista când portalul își schimbă cerințele.
                          </p>
                        </div>
                        {taxonomy.data && taxonomy.data.ok === false ? (
                          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                            {taxonomy.data.error}
                          </p>
                        ) : null}
                        <dl className="grid gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">Ultima actualizare</dt>
                            <dd>
                              {taxonomy.data?.ok && taxonomy.data.cache
                                ? formatDateTime(taxonomy.data.cache.fetchedAt)
                                : "Niciodată"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Categorii disponibile</dt>
                            <dd>
                              {taxonomy.data?.ok && taxonomy.data.cache
                                ? taxonomy.data.cache.categoryCount
                                : "—"}
                            </dd>
                          </div>
                        </dl>
                        {taxonomy.data?.ok && taxonomy.data.cache?.stale ? (
                          <p className="text-xs text-muted-foreground">
                            Lista este mai veche de o zi. Reîmprospătează-o pentru siguranță.
                          </p>
                        ) : null}
                        {taxonomy.data?.ok && taxonomy.data.cache ? (
                          <TaxonomyDiscrepancies cache={taxonomy.data.cache} />
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => refreshTaxonomy.mutate()}
                          disabled={refreshTaxonomy.isPending}
                        >
                          {refreshTaxonomy.isPending
                            ? "Se actualizează…"
                            : "Reîmprospătează taxonomia"}
                        </Button>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="text-sm">
                        <p className="font-medium">Activat pentru agenție</p>
                        <p className="text-xs text-muted-foreground">
                          Când este activat, agenția vede portalul, își bifează singură ofertele și
                          trimiterile către portal se fac efectiv.
                        </p>

                      </div>
                      <Switch
                        checked={item.connection.activated}
                        disabled={activation.isPending || item.portal.status !== "available"}
                        onCheckedChange={(checked) =>
                          activation.mutate({ portalId: item.portal.id, activated: checked })
                        }
                        aria-label="Activat pentru agenție"
                      />
                    </div>

                    {item.indexStatus ? (
                      <div className="rounded-lg border border-border p-3 text-sm">
                        <p className="text-muted-foreground">Stare în indexul ClickImob</p>
                        <p className="font-medium">{item.indexStatus}</p>
                      </div>
                    ) : null}


                    {item.oauth || item.indexOnly ? null : (
                      <div className="space-y-2 rounded-lg border border-border p-3">
                        <p className="text-sm font-medium">Acces al portalului la ofertele tale</p>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate font-mono">{item.feedUrl}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => copy(item.feedUrl, "Link copiat.")}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                        {item.feedUrlCsv ? (
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate font-mono">{item.feedUrlCsv}</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => copy(item.feedUrlCsv!, "Link CSV copiat.")}
                            >
                              <Copy className="size-3.5" />
                            </Button>
                          </div>
                        ) : null}
                        {!item.portal.authentication.includes("habitoo_api_key") ? (
                          <p className="text-xs text-muted-foreground">
                            {portalDisplayName(item.portal.id)} folosește cheia API proprie, emisă de portal.
                            Salvează cheia mai sus — Habitoo nu emite chei pentru acest portal.
                          </p>
                        ) : (
                          <>
                            {activeKeys.length ? (
                              <ul className="divide-y divide-border text-sm">
                                {activeKeys.map((k) => (
                                  <li key={k.id} className="flex flex-wrap items-center gap-2 py-2">
                                    <span className="min-w-0 flex-1 truncate">
                                      {k.label} ·{" "}
                                      <span className="font-mono text-xs">{k.keyPrefix}…</span>
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {k.requestCount} cereri ·{" "}
                                      {k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "nefolosită"}
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive"
                                      onClick={() => setConfirmRevoke(k.id)}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Nicio cheie activă. Generează una și trimite-o portalului.
                              </p>
                            )}
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="min-w-40 flex-1 space-y-1.5">
                                <Label htmlFor={`${item.portal.id}-key-label`}>Nume cheie</Label>
                                <Input
                                  id={`${item.portal.id}-key-label`}
                                  value={keyLabel[item.portal.id] ?? ""}
                                  onChange={(e) =>
                                    setKeyLabel((prev) => ({
                                      ...prev,
                                      [item.portal.id]: e.target.value,
                                    }))
                                  }
                                  placeholder={`Cheie ${portalDisplayName(item.portal.id)}`}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => issueKey.mutate(item.portal.id)}
                                disabled={issueKey.isPending}
                              >
                                <KeyRound className="mr-2 size-4" />
                                Generează cheie
                              </Button>
                            </div>
                            {freshKey && freshKey.portalId === item.portal.id ? (
                              <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
                                <p className="text-sm font-medium">
                                  Copiază cheia acum — nu se mai afișează.
                                </p>
                                <div className="flex items-center gap-2">
                                  <code className="min-w-0 flex-1 truncate text-xs">
                                    {freshKey.key}
                                  </code>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => copy(freshKey.key, "Cheie copiată.")}
                                  >
                                    <Copy className="size-3.5" />
                                  </Button>
                                 </div>
                                 {freshKey.feedUrl ? (
                                   <div className="space-y-1.5 border-t border-primary/30 pt-2">
                                     <p className="text-sm font-medium">
                                       Link pentru portal — copiază acum, nu se mai afișează
                                     </p>
                                     <div className="flex items-center gap-2">
                                       <code className="min-w-0 flex-1 truncate text-xs">
                                         {freshKey.feedUrl}
                                       </code>
                                       <Button
                                         type="button"
                                         size="sm"
                                         onClick={() =>
                                           copy(freshKey.feedUrl!, "Link copiat.")
                                         }
                                       >
                                         <Copy className="size-3.5" />
                                       </Button>
                                     </div>
                                     <p className="text-xs text-muted-foreground">
                                       Acesta este linkul complet pe care îl trimiți portalului.
                                     </p>
                                   </div>
                                 ) : null}
                                 <Button
                                   type="button"
                                   size="sm"
                                   variant="ghost"
                                   onClick={() => setFreshKey(null)}
                                 >
                                   Am salvat-o
                                 </Button>
                               </div>

                            ) : null}
                          </>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {item.portal.configuration_schema.fields.length ? (
                        <Button
                          type="button"
                          onClick={() => save.mutate({ portalId: item.portal.id })}
                          disabled={save.isPending}
                        >
                          <Save className="mr-2 size-4" />
                          Salvează
                        </Button>
                      ) : null}
                      {item.supportsConnectionTest ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => test.mutate(item.portal.id)}
                          disabled={test.isPending}
                        >
                          <PlugZap className="mr-2 size-4" />
                          {item.feedOnly ? "Verifică feedul" : "Testează conexiunea"}
                        </Button>
                      ) : null}
                      {item.supportsFeedPreview ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => preview.mutate(item.portal.id)}
                          disabled={preview.isPending}
                        >
                          <Eye className="mr-2 size-4" />
                          Previzualizează ofertele
                        </Button>
                      ) : null}
                      {item.portal.docs ? (
                        <a
                          href={item.portal.docs}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
                        >
                          <ExternalLink className="size-3.5" /> Documentație portal
                        </a>
                      ) : null}
                      {item.connection.hasPortalCredential || item.connection.externalAccountId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setConfirmDisconnect(item.portal.id)}
                        >
                          <Unplug className="mr-2 size-4" />
                          Deconectează
                        </Button>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {item.portal.capabilities.map((c) => (
                        <span
                          key={c}
                          className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {PORTAL_CAPABILITY_LABEL[c]}
                        </span>
                      ))}
                    </div>

                    {item.portal.notes ? (
                      <p className="text-xs text-muted-foreground">{item.portal.notes}</p>
                    ) : null}
                  </>
                )}
              </div>
            }
          </div>
        );
      })}

      {feedPreview ? (
        <div className="panel space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Previzualizare feed — {feedPreview.portalName}</h3>
            <Button type="button" size="sm" variant="ghost" onClick={() => setFeedPreview(null)}>
              Închide
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {feedPreview.valid} oferte valide din {feedPreview.selected} selectate ·{" "}
            {feedPreview.hasActiveKey
              ? "cheie API salvată"
              : "cheia API a portalului nu e salvată — portalul nu poate citi feedul"}
          </p>
          {feedPreview.excluded.length ? (
            <ul className="space-y-1 text-sm">
              {feedPreview.excluded.map((ex) => (
                <li key={ex.propertyId} className="text-destructive">
                  {ex.reference ?? ex.title ?? ex.propertyId}: {ex.reasons.join("; ")}
                </li>
              ))}
            </ul>
          ) : null}
          <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
            {JSON.stringify(feedPreview.sample, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h3 className="font-medium">Jurnal operațiuni portaluri</h3>
          <p className="text-sm text-muted-foreground">
            Operațiile se văd pe pagina separată, filtrate pe agenție{selected ? " și portal" : ""}.
          </p>
        </div>
        <Button asChild variant="outline" className="h-11 shrink-0">
          <Link
            to="/superadmin/portal-logs"
            search={{ org: organizationId, ...(selected ? { portal: selected } : {}) }}
          >
            Vezi jurnalul
          </Link>
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDisconnect !== null}
        onOpenChange={(open) => setConfirmDisconnect(open ? confirmDisconnect : null)}
        title="Deconectezi portalul?"
        description="Credențialele salvate se șterg, cheile emise pentru portal se revocă și trimiterile se opresc."
        confirmLabel="Deconectează"
        destructive
        onConfirm={() => {
          if (confirmDisconnect) disconnect.mutate(confirmDisconnect);
          setConfirmDisconnect(null);
        }}
      />

      <ConfirmDialog
        open={confirmSwitch !== null}
        onOpenChange={(o) => setConfirmSwitch(o ? confirmSwitch : null)}
        title="Ai modificări nesalvate"
        description="Datele completate pentru portalul curent nu au fost salvate. Dacă comuți pe alt portal, se pierd."
        confirmLabel="Comută și renunță"
        destructive
        onConfirm={() => {
          if (confirmSwitch) {
            const id = confirmSwitch;
            setAccountId((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setEndpoint((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setCredential((prev) => ({ ...prev, [id]: "" }));
            persistSelected(id);
          }
          setConfirmSwitch(null);
        }}
      />

      <ConfirmDialog
        open={confirmDeactivate !== null}
        onOpenChange={(o) => setConfirmDeactivate(o ? confirmDeactivate : null)}
        title="Dezactivezi portalul pentru agenție?"
        description="Agenția nu va mai putea publica pe acest portal, iar trimiterile reale către el se opresc. Dezactivarea nu retrage automat anunțurile publicate."
        confirmLabel="Dezactivează"
        destructive
        onConfirm={() => {
          if (confirmDeactivate) {
            activation.mutate({ portalId: confirmDeactivate, activated: false });
          }
          setConfirmDeactivate(null);
        }}
      />

      <ConfirmDialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => setConfirmRevoke(open ? confirmRevoke : null)}
        title="Revoci cheia?"
        description="Portalul nu va mai putea citi ofertele cu această cheie. Poți genera oricând una nouă."
        confirmLabel="Revocă"
        destructive
        onConfirm={() => {
          if (confirmRevoke) revokeKey.mutate(confirmRevoke);
          setConfirmRevoke(null);
        }}
      />
    </div>
  );
}

/** Diferențele dintre cerințele reale ale portalului și maparea din Habitoo. */
function TaxonomyDiscrepancies({
  cache,
}: {
  cache: {
    discrepancies?: {
      missingCategories?: string[];
      newRequired?: { category: string; attribute: string }[];
      noLongerRequired?: { category: string; attribute: string }[];
      changedAttributes?: { category: string; attribute: string }[];
    };
  };
}) {
  const d = cache.discrepancies ?? {};
  const items: string[] = [];
  for (const category of d.missingCategories ?? []) {
    items.push(`Categorie folosită de Habitoo, dar inexistentă pe portal: ${category}`);
  }
  for (const entry of d.newRequired ?? []) {
    items.push(`Câmp devenit obligatoriu: ${entry.attribute} (${entry.category})`);
  }
  for (const entry of d.noLongerRequired ?? []) {
    items.push(`Câmp care nu mai este obligatoriu: ${entry.attribute} (${entry.category})`);
  }
  for (const entry of d.changedAttributes ?? []) {
    items.push(`Câmp modificat de portal: ${entry.attribute} (${entry.category})`);
  }
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Maparea Habitoo corespunde cerințelor actuale ale portalului.
      </p>
    );
  }
  return (
    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
      {items.slice(0, 12).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
