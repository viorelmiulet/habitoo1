/**
 * Hub-ul de portaluri imobiliare (Superadmin → Portaluri), per agenție.
 * UI generic: totul vine din registry, nimic nu este hardcodat pentru un portal.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronDown,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  disconnectPortal,
  getPortalHub,
  getPortalLogs,
  issuePortalApiKey,
  previewPortalFeed,
  revokePortalApiKey,
  savePortalConnection,
  setPortalActivation,
  testPortalConnection,
} from "@/lib/portals.functions";
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
  type PortalAuthenticationMode,
  type PortalDirection,
} from "@/lib/portals/registry";

export function PortalsCard({ organizationId }: { organizationId: string }) {
  const hubKey = ["portal-hub", organizationId] as const;
  const logsKey = ["portal-logs", organizationId] as const;
  const queryClient = useQueryClient();
  const loadHub = useServerFn(getPortalHub);
  const loadLogs = useServerFn(getPortalLogs);
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
  const [freshKey, setFreshKey] = useState<{ portalId: string; key: string } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  // Carduri restrânse implicit; starea se păstrează la navigare înapoi (per agenție).
  const expandedStorageKey = `habitoo:portals-expanded:${organizationId}`;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmCollapse, setConfirmCollapse] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(expandedStorageKey);
      setExpanded(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
    } catch {
      setExpanded({});
    }
  }, [expandedStorageKey]);

  const persistExpanded = (next: Record<string, boolean>) => {
    setExpanded(next);
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(expandedStorageKey, JSON.stringify(next));
    } catch {
      /* sesiunea nu poate fi scrisă — starea rămâne doar în pagină */
    }
  };

  const collapse = (portalId: string) => {
    const next = { ...expanded };
    delete next[portalId];
    persistExpanded(next);
  };
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [feedPreview, setFeedPreview] = useState<Awaited<
    ReturnType<typeof previewPortalFeed>
  > | null>(null);

  const hub = useQuery({ queryKey: hubKey, queryFn: () => loadHub({ data: { organizationId } }) });
  const logs = useQuery({
    queryKey: logsKey,
    queryFn: () => loadLogs({ data: { organizationId } }),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: hubKey });
    queryClient.invalidateQueries({ queryKey: logsKey });
  };

  const save = useMutation({
    mutationFn: (input: { portalId: string; allowLiveRequests?: boolean }) =>
      runSave({
        data: {
          organizationId,
          portalId: input.portalId,
          externalAccountId: accountId[input.portalId]?.trim(),
          credential: credential[input.portalId]?.trim() || undefined,
          endpointUrl: endpoint[input.portalId]?.trim(),
          ...(input.allowLiveRequests === undefined
            ? {}
            : { allowLiveRequests: input.allowLiveRequests }),
        },
      }),
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
      setFreshKey({ portalId, key: res.key });
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

  if (hub.isLoading) return <InlineLoading label="Se încarcă portalurile…" />;
  if (hub.isError) return <QueryError error={hub.error} onRetry={() => hub.refetch()} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Portaluri imobiliare</h2>
        <p className="text-sm text-muted-foreground">
          Conectează agenția la portaluri, emite chei de acces pentru ele și urmărește ce s-a
          trimis. Nimic nu pleacă spre un portal până nu activezi explicit trimiterile reale.
        </p>
      </div>

      {(hub.data ?? []).map((item) => {
        const badge = PORTAL_CONNECTION_LABEL[item.connection.status];
        const unavailable = item.portal.status !== "available";
        const activeKeys = item.keys.filter((k) => k.status === "active");
        const open = expanded[item.portal.id] === true;
        // Un portal cu erori rămâne evidențiat și restrâns, ca să nu fie ratat.
        const hasError =
          item.connection.status === "error" || Boolean(item.connection.lastSyncError);
        // Modificări tastate, dar nesalvate — blochează restrângerea silențioasă.
        const dirty =
          (credential[item.portal.id]?.trim() ?? "") !== "" ||
          (accountId[item.portal.id] !== undefined &&
            accountId[item.portal.id] !== (item.connection.externalAccountId ?? "")) ||
          (endpoint[item.portal.id] !== undefined &&
            endpoint[item.portal.id] !== (item.connection.endpointUrl ?? ""));
        const toggle = () => {
          if (open) {
            if (dirty) {
              setConfirmCollapse(item.portal.id);
              return;
            }
            collapse(item.portal.id);
            return;
          }
          persistExpanded({ ...expanded, [item.portal.id]: true });
        };
        return (
          <div
            key={item.portal.id}
            className={
              hasError ? "panel border-destructive/50 ring-1 ring-destructive/20" : "panel"
            }
          >
            <div className="flex items-center gap-2 px-5 py-4">
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-left"
              >
                <PortalLogoStack
                  portalId={item.portal.id}
                  name={portalDisplayName(item.portal.id)}
                  size={40}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{portalDisplayName(item.portal.id)}</span>
                  <span className="block text-xs text-muted-foreground">
                    Ultima verificare:{" "}
                    {item.connection.lastSyncAt
                      ? formatDateTime(item.connection.lastSyncAt)
                      : "niciodată"}
                  </span>
                </span>
                {unavailable ? (
                  <StatusBadge tone="neutral">
                    {PORTAL_AVAILABILITY_LABEL[item.portal.status]}
                  </StatusBadge>
                ) : (
                  <>
                    <StatusBadge tone={badge.tone} dot>
                      {badge.label}
                    </StatusBadge>
                    <StatusBadge tone={item.connection.activated ? "success" : "neutral"}>
                      {item.connection.activated ? "Activat pentru agenție" : "Neactivat"}
                    </StatusBadge>
                  </>
                )}
                {dirty ? <StatusBadge tone="warning">Modificări nesalvate</StatusBadge> : null}
                <ChevronDown
                  className={
                    open
                      ? "size-4 shrink-0 rotate-180 text-muted-foreground transition-transform"
                      : "size-4 shrink-0 text-muted-foreground transition-transform"
                  }
                  aria-hidden
                />
              </button>
              {item.portal.website ? (
                <a
                  href={item.portal.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Deschide ${portalDisplayName(item.portal.id)}`}
                >
                  <ExternalLink className="size-4" />
                </a>
              ) : null}
            </div>

            {hasError && !open && item.connection.lastSyncError ? (
              <p className="px-5 pb-4 text-sm text-destructive">{item.connection.lastSyncError}</p>
            ) : null}

            {open ? (
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
                          <div>
                            <dt className="text-muted-foreground">Credențiale portal</dt>
                            <dd>
                              {item.connection.hasPortalCredential
                                ? "Salvate și criptate"
                                : "Nesalvate"}
                            </dd>
                          </div>
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
                              {!item.oauth.connected
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
                            {item.oauth.connected
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
                          Când este activat, agenția vede portalul și își bifează singură ofertele
                          pentru publicare.
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

                    {item.feedOnly ? null : (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                        <div className="text-sm">
                          <p className="font-medium">Trimiteri reale către portal</p>
                          <p className="text-xs text-muted-foreground">
                            Cât timp este oprit, Habitoo doar verifică local și îți arată ce ar
                            trimite.
                          </p>
                        </div>
                        <Switch
                          checked={item.connection.allowLiveRequests}
                          disabled={save.isPending || !item.connection.hasPortalCredential}
                          onCheckedChange={(checked) =>
                            save.mutate({ portalId: item.portal.id, allowLiveRequests: checked })
                          }
                          aria-label="Trimiteri reale către portal"
                        />
                      </div>
                    )}

                    {item.oauth ? null : (
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
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setFreshKey(null)}
                                  >
                                    Am salvat-o
                                  </Button>
                                </div>
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
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => test.mutate(item.portal.id)}
                        disabled={test.isPending}
                      >
                        <PlugZap className="mr-2 size-4" />
                        {item.feedOnly ? "Verifică feedul" : "Testează conexiunea"}
                      </Button>
                      {item.feedOnly ? (
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
            ) : null}
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

      <div className="panel space-y-3 p-5">
        <h3 className="font-medium">Jurnal operațiuni portaluri</h3>
        {logs.isLoading ? (
          <InlineLoading label="Se încarcă jurnalul…" />
        ) : (logs.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Încă nu s-a executat nicio operațiune.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(logs.data ?? []).map((log) => (
              <li key={log.id} className="flex flex-wrap items-center gap-2 py-2">
                <StatusBadge tone={log.success ? "success" : "danger"}>
                  {log.success ? "OK" : (log.errorCode ?? "Eroare")}
                </StatusBadge>
                <span className="min-w-0 flex-1 truncate">
                  {log.portal} · {log.operation}
                  {log.errorMessage ? ` — ${log.errorMessage}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
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
        open={confirmCollapse !== null}
        onOpenChange={(o) => setConfirmCollapse(o ? confirmCollapse : null)}
        title="Ai modificări nesalvate"
        description="Datele completate pentru acest portal nu au fost salvate. Dacă restrângi cardul, se pierd."
        confirmLabel="Restrânge și renunță"
        destructive
        onConfirm={() => {
          if (confirmCollapse) {
            const id = confirmCollapse;
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
            collapse(id);
          }
          setConfirmCollapse(null);
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
