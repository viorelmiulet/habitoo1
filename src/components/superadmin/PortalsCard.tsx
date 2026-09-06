/**
 * Hub-ul de portaluri imobiliare (Superadmin → Portaluri), per agenție.
 * UI generic: totul vine din registry, nimic nu este hardcodat pentru un portal.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Eye, ExternalLink, KeyRound, PlugZap, Save, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/app/StatusBadge";
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
  PORTAL_AUTH_LABEL,
  PORTAL_AVAILABILITY_LABEL,
  PORTAL_CAPABILITY_LABEL,
  PORTAL_CONNECTION_LABEL,
  PORTAL_DIRECTION_LABEL,
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

  const [accountId, setAccountId] = useState<Record<string, string>>({});
  const [credential, setCredential] = useState<Record<string, string>>({});
  const [endpoint, setEndpoint] = useState<Record<string, string>>({});
  const [keyLabel, setKeyLabel] = useState<Record<string, string>>({});
  const [freshKey, setFreshKey] = useState<{ portalId: string; key: string } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [feedPreview, setFeedPreview] = useState<Awaited<ReturnType<typeof previewPortalFeed>> | null>(null);

  const hub = useQuery({ queryKey: hubKey, queryFn: () => loadHub({ data: { organizationId } }) });
  const logs = useQuery({ queryKey: logsKey, queryFn: () => loadLogs({ data: { organizationId } }) });
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
          ...(input.allowLiveRequests === undefined ? {} : { allowLiveRequests: input.allowLiveRequests }),
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
      runActivation({ data: { organizationId, portalId: input.portalId, activated: input.activated } }),
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
      runIssueKey({ data: { organizationId, portalId, label: keyLabel[portalId]?.trim() || "Cheie portal" } }),
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
        return (
          <div key={item.portal.id} className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <PortalLogo
                  portalId={item.portal.id}
                  name={item.portal.display_name}
                  fallback={item.portal.logo}
                  size={40}
                  className="rounded-lg"
                />
                <div>
                  <h3 className="flex items-center gap-2 font-medium">
                    {item.portal.display_name}
                    {item.portal.website ? (
                      <a
                        href={item.portal.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Deschide ${item.portal.display_name}`}
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </h3>
                  <p className="text-sm text-muted-foreground">{item.portal.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {unavailable ? (
                  <StatusBadge tone="neutral">{PORTAL_AVAILABILITY_LABEL[item.portal.status]}</StatusBadge>
                ) : (
                  <StatusBadge tone={badge.tone} dot>
                    {badge.label}
                  </StatusBadge>
                )}
              </div>
            </div>

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
                        <dd>{item.connection.hasPortalCredential ? "Salvate și criptate" : "Nesalvate"}</dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Ultima verificare</dt>
                    <dd>{item.connection.lastSyncAt ? formatDateTime(item.connection.lastSyncAt) : "Niciodată"}</dd>
                  </div>
                </dl>

                <dl className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Oferte în feed</dt>
                    <dd>{item.feed.properties ?? 0}</dd>
                  </div>
                  {item.feedOnly ? (
                    <div>
                      <dt className="text-muted-foreground">Oferte excluse (date incomplete)</dt>
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
                    <dd>{item.feed.ok ? (item.feed.apiVersion ?? "funcțional") : "indisponibil"}</dd>
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
                    return (
                      <div key={field.key} className="space-y-1.5">
                        <Label htmlFor={`${item.portal.id}-${field.key}`}>{field.label}</Label>
                        <Input
                          id={`${item.portal.id}-${field.key}`}
                          type={field.secret ? "password" : "text"}
                          autoComplete="off"
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          placeholder={
                            field.secret && item.connection.hasPortalCredential
                              ? "Salvat — completează pentru a-l înlocui"
                              : (field.placeholder ?? "")
                          }
                        />
                        {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="text-sm">
                    <p className="font-medium">Activat pentru agenție</p>
                    <p className="text-xs text-muted-foreground">
                      Când este activat, agenția vede portalul și își bifează singură ofertele pentru publicare.
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
                      Cât timp este oprit, Habitoo doar verifică local și îți arată ce ar trimite.
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

                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">Acces al portalului la ofertele tale</p>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-mono">{item.feedUrl}</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => copy(item.feedUrl, "Link copiat.")}>
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
                      {item.portal.display_name} folosește cheia API proprie, emisă de portal. Salvează cheia mai
                      sus — Habitoo nu emite chei pentru acest portal.
                    </p>
                  ) : (
                    <>
                  {activeKeys.length ? (
                    <ul className="divide-y divide-border text-sm">
                      {activeKeys.map((k) => (
                        <li key={k.id} className="flex flex-wrap items-center gap-2 py-2">
                          <span className="min-w-0 flex-1 truncate">
                            {k.label} · <span className="font-mono text-xs">{k.keyPrefix}…</span>
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
                        onChange={(e) => setKeyLabel((prev) => ({ ...prev, [item.portal.id]: e.target.value }))}
                        placeholder={`Cheie ${item.portal.display_name}`}
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
                      <p className="text-sm font-medium">Copiază cheia acum — nu se mai afișează.</p>
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate text-xs">{freshKey.key}</code>
                        <Button type="button" size="sm" onClick={() => copy(freshKey.key, "Cheie copiată.")}>
                          <Copy className="size-3.5" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setFreshKey(null)}>
                          Am salvat-o
                        </Button>
                      </div>
                    </div>
                  ) : null}
                    </>
                  )}

                </div>

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
                    <span key={c} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
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
            {feedPreview.hasActiveKey ? "cheie API salvată" : "cheia API a portalului nu e salvată — portalul nu poate citi feedul"}
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
                <span className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>
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
