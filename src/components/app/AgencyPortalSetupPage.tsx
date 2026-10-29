import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Copy, KeyRound, PlugZap, Save, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { LaCheieActivationPanel } from "@/components/app/LaCheieActivationPanel";
import { useCurrentUser } from "@/hooks/use-session";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { validatePortalConfigValues, PORTAL_CONNECTION_LABEL } from "@/lib/portals/registry";
import { isKeyRequestPortal, keyRequestLabel } from "@/lib/portals/imospot-key-request";
import { LACHEIE_PORTAL_KEY } from "@/lib/portals/lacheie/config";
import { ZUP_MISSING_MESSAGE } from "@/lib/portals/zup/config";
import { getAgencyPortalCatalog, requestPortalActivation, selfActivatePortal } from "@/lib/portal-activation.functions";
import { startStoriaAuthorization } from "@/lib/portals/storia.functions";
import { startOlxAuthorization } from "@/lib/portals/olx.functions";
import { startZupAuthorization, revokeZupAuthorization, testZupAuthorization } from "@/lib/portals/zup.functions";
import {
  getAgencyPortalSetup,
  issueAgencyPortalApiKey,
  revokeAgencyPortalApiKey,
  saveAgencyPortalConnection,
  setAgencyPortalActive,
  testAgencyPortalConnection,
} from "@/lib/agency-portal-setup.functions";

const OAUTH_PORTALS = new Set(["storia", "olx_direct", "zup"]);

function BackLink() {
  return (
    <Button asChild variant="outline" className="h-11">
      <Link to="/app/settings" search={{ tab: "portals" }}>
        <ArrowLeft className="mr-2 size-4" /> Înapoi la portaluri
      </Link>
    </Button>
  );
}

export function AgencyPortalSetupPage({ portalId }: { portalId: string }) {
  const { data: user, isLoading } = useCurrentUser();
  const isAgencyAdmin = user?.roles.includes("agency_admin") === true;
  if (isLoading) return <InlineLoading label="Se încarcă…" />;
  if (!isAgencyAdmin) {
    return (
      <div className="space-y-4 p-5" data-agency-portal-denied>
        <BackLink />
        <p className="text-sm text-muted-foreground">Doar administratorul agenției poate activa și configura portalurile.</p>
      </div>
    );
  }
  return <AgencyPortalSetupBody portalId={portalId} organizationId={user?.organization?.id ?? null} />;
}

function AgencyPortalSetupBody({ portalId, organizationId }: { portalId: string; organizationId: string | null }) {
  const queryClient = useQueryClient();
  const setupKey = ["agency-portal-setup", portalId] as const;
  const loadSetup = useServerFn(getAgencyPortalSetup);
  const loadCatalog = useServerFn(getAgencyPortalCatalog);
  const runSave = useServerFn(saveAgencyPortalConnection);
  const runTest = useServerFn(testAgencyPortalConnection);
  const runActive = useServerFn(setAgencyPortalActive);
  const runIssue = useServerFn(issueAgencyPortalApiKey);
  const runRevoke = useServerFn(revokeAgencyPortalApiKey);
  const runRequest = useServerFn(requestPortalActivation);
  const runSelfActivate = useServerFn(selfActivatePortal);
  const runStoria = useServerFn(startStoriaAuthorization);
  const runOlx = useServerFn(startOlxAuthorization);
  const runZup = useServerFn(startZupAuthorization);
  const revokeZup = useServerFn(revokeZupAuthorization);
  const testZup = useServerFn(testZupAuthorization);

  const setup = useQuery({ queryKey: setupKey, queryFn: () => loadSetup({ data: { portalId } }) });
  const catalog = useQuery({ queryKey: ["agency-portal-catalog"], queryFn: () => loadCatalog({}) });
  const catalogItem = (catalog.data ?? []).find((i) => i.id === portalId) ?? null;

  const [values, setValues] = useState<Record<string, string>>({});
  const [replacing, setReplacing] = useState<Record<string, boolean>>({});
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<{ key: string; feedUrl: string | null } | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: setupKey });
    void queryClient.invalidateQueries({ queryKey: ["agency-portal-catalog"] });
  };

  const collect = () => {
    const fields = setup.data?.fields ?? [];
    const out: { externalAccountId?: string; credential?: string; endpointUrl?: string; webhookSecret?: string } = {};
    for (const f of fields) {
      const v = values[f.key];
      if (v === undefined) continue;
      const t = v.trim();
      if (f.target === "external_account_id") out.externalAccountId = t;
      else if (f.target === "credentials") { if (t) out.credential = t; }
      else if (f.target === "webhook_secret") { if (t) out.webhookSecret = t; }
      else out.endpointUrl = t;
    }
    return out;
  };
  const dirty = Object.values(values).some((v) => v !== undefined);

  const save = useMutation({
    mutationFn: async () => {
      const data = collect();
      const formatError = validatePortalConfigValues(portalId, data);
      if (formatError) throw new Error(formatError);
      await runSave({ data: { portalId, ...data } });
    },
    onSuccess: () => {
      setValues({});
      setReplacing({});
      invalidate();
      toast.success("Datele de acces au fost salvate.");
    },
    onError: (e: Error) => toastError(e),
  });

  const test = useMutation({
    mutationFn: () => runTest({ data: { portalId } }),
    onSuccess: (res) => {
      invalidate();
      if (!res.ok) { toast.error(res.message); return; }
      if (res.live && res.detail) { toast.success(res.detail, { duration: 10_000 }); return; }
      toast.success(
        res.feed
          ? `Feed verificat: ${res.feed.properties ?? 0} oferte, ${res.feed.agents ?? 0} agenți, ${res.feed.activeKeys ?? 0} chei active.`
          : res.live
            ? "Conexiunea a fost verificată cu portalul."
            : "Configurarea este completă. Trimiterile reale sunt încă oprite (mod simulare).",
      );
    },
    onError: (e: Error) => toastError(e),
  });

  const active = useMutation({
    mutationFn: async (activated: boolean) => {
      if (activated && dirty) await save.mutateAsync();
      return runActive({ data: { portalId, activated } });
    },
    onSuccess: (res) => {
      invalidate();
      toast.success(res.activated ? "Portalul a fost activat." : "Portalul a fost dezactivat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const request = useMutation({
    mutationFn: () => runRequest({ data: { portalId } }),
    onSuccess: () => {
      toast.success(`Cererea a fost trimisă către ${keyRequestLabel(portalId)}. Vei primi cheia pe email.`);
      invalidate();
    },
    onError: () => toast.error("Cererea nu a fost trimisă. Încearcă din nou."),
  });

  const connect = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Agenția nu a fost găsită.");
      if (portalId !== "olx_direct" && portalId !== "zup") await runSelfActivate({ data: { portalId } });
      const { url } =
        portalId === "olx_direct" ? await runOlx({ data: { organizationId } })
        : portalId === "zup" ? await runZup({ data: { organizationId } })
        : await runStoria({ data: { organizationId } });
      window.location.assign(url);
    },
    onError: (e: Error) => toast.error(e.message || "Conectarea nu a pornit. Încearcă din nou sau scrie-ne."),
  });

  const zupAction = useMutation({
    mutationFn: async (action: "test" | "disconnect") => {
      if (!organizationId) throw new Error("Agenția nu a fost găsită.");
      if (action === "disconnect") { await revokeZup({ data: { organizationId } }); return "Contul ZUP a fost deconectat."; }
      const result = await testZup({ data: { organizationId } });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (m) => { toast.success(m); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const issue = useMutation({
    mutationFn: () => runIssue({ data: { portalId } }),
    onSuccess: (res) => { setFreshKey({ key: res.key, feedUrl: res.feedUrl ?? null }); invalidate(); },
    onError: (e: Error) => toastError(e),
  });
  const revoke = useMutation({
    mutationFn: (keyId: string) => runRevoke({ data: { keyId } }),
    onSuccess: () => { invalidate(); toast.success("Cheia a fost revocată."); },
    onError: (e: Error) => toastError(e),
  });

  const copy = async (value: string, message = "Copiat.") => {
    try { await navigator.clipboard.writeText(value); toast.success(message); }
    catch { toast.error("Copierea nu a funcționat. Selectează manual textul."); }
  };

  if (setup.isLoading) return <div className="p-5"><InlineLoading label="Se încarcă portalul…" /></div>;
  if (setup.isError || !setup.data) {
    return (
      <div className="space-y-4 p-5">
        <BackLink />
        <QueryError error={new Error("Portalul nu s-a încărcat. Încearcă din nou.")} onRetry={() => setup.refetch()} />
      </div>
    );
  }

  const s = setup.data;
  const status = PORTAL_CONNECTION_LABEL[s.connection.status];
  const isOAuth = OAUTH_PORTALS.has(s.id);
  const isLaCheie = s.id === LACHEIE_PORTAL_KEY;
  const busy = save.isPending || test.isPending || active.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6" data-agency-portal-setup={s.id}>
      <BackLink />
      <section className="panel space-y-4 p-5">
        <div className="flex items-center gap-3">
          <PortalLogoStack portalId={s.id} name={s.displayName} size={48} className="shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold break-words">{s.displayName}</h1>
            <p className="text-sm text-muted-foreground" data-portal-state={s.connection.status}>
              {s.connection.activated ? status.label : "Neactivat"}
              {s.connection.lastSyncAt ? ` · Verificat: ${formatDateTime(s.connection.lastSyncAt)}` : ""}
            </p>
          </div>
        </div>
        <p className="text-sm" data-access-source>{s.accessSource}</p>
        {s.connection.lastSyncError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{s.connection.lastSyncError}</p>
        ) : null}

        {isKeyRequestPortal(s.id) ? (
          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <p className="text-muted-foreground">
              Cheia API este emisă de {keyRequestLabel(s.id)}, de obicei în aceeași zi lucrătoare, și ajunge pe emailul administratorului.
            </p>
            {catalogItem?.companyDataMissing.length ? (
              <p className="text-destructive">
                Completează datele firmei în{" "}
                <Link to="/app/settings" search={{ tab: "agency" }} className="underline">Setări → Agenție</Link>{" "}
                ca să poți solicita cheia {keyRequestLabel(s.id)}.
              </p>
            ) : null}
            <Button variant="outline" disabled={request.isPending} onClick={() => request.mutate()}>
              {catalogItem?.request?.status === "approved" ? "Solicită din nou cheia" : `Solicită cheia ${keyRequestLabel(s.id)}`}
            </Button>
          </div>
        ) : null}

        {isOAuth ? (
          <div className="flex flex-wrap gap-2">
            {s.id === "zup" ? (
              <>
                <Button className="h-auto min-h-11 whitespace-normal" disabled={connect.isPending || catalogItem?.zupConfigured !== true} onClick={() => connect.mutate()}>
                  {catalogItem?.zupConfigured !== true ? ZUP_MISSING_MESSAGE : catalogItem.zupConnected ? "Reconectează contul ZUP" : "Conectează contul ZUP"}
                </Button>
                {catalogItem?.zupConnected ? (
                  <>
                    <Button variant="outline" disabled={zupAction.isPending} onClick={() => zupAction.mutate("test")}>Testează conexiunea</Button>
                    <Button variant="outline" disabled={zupAction.isPending} onClick={() => zupAction.mutate("disconnect")}>Deconectează</Button>
                  </>
                ) : null}
              </>
            ) : (
              <Button className="h-11" disabled={connect.isPending} onClick={() => connect.mutate()}>
                {s.connection.status === "disconnected" ? "Conectează contul" : "Reconectează contul"}
              </Button>
            )}
          </div>
        ) : isLaCheie && organizationId ? (
          <LaCheieActivationPanel organizationId={organizationId} />
        ) : (
          <>
            {s.fields.length ? (
              <div className="grid gap-3 sm:grid-cols-2" data-portal-fields>
                {s.fields.map((field) => {
                  const id = `${s.id}-${field.key}`;
                  const saved = field.target === "webhook_secret" ? s.connection.hasWebhookSecret : s.connection.hasPortalCredential;
                  if (field.secret && saved && !replacing[field.key]) {
                    return (
                      <div key={field.key} className="space-y-1.5">
                        <Label>{field.label}</Label>
                        <div className="flex items-center gap-2 text-sm">
                          <span data-secret-saved>Cheie salvată</span>
                          {s.id === "zonata" && s.connection.keyMode ? (
                            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium">{s.connection.keyMode === "test" ? "Test" : "Live"}</span>
                          ) : null}
                          <Button type="button" size="sm" variant="ghost" onClick={() => setReplacing((p) => ({ ...p, [field.key]: true }))}>Înlocuiește</Button>
                        </div>
                      </div>
                    );
                  }
                  const current =
                    values[field.key] ??
                    (field.secret ? "" : field.target === "external_account_id" ? (s.connection.externalAccountId ?? "") : (s.connection.endpointUrl ?? ""));
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={id}>{field.label}{field.optional ? " (opțional)" : ""}</Label>
                      <Input
                        id={id}
                        type={field.secret ? "password" : "text"}
                        autoComplete="off"
                        value={current}
                        placeholder={field.placeholder ?? ""}
                        onChange={(e) => setValues((p) => ({ ...p, [field.key]: e.target.value }))}
                      />
                      {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {s.feedUrl ? (
              <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
                <p className="text-sm font-medium">Acces al portalului la ofertele tale</p>
                {[s.feedUrl, s.feedUrlCsv].filter((u): u is string => Boolean(u)).map((u) => (
                  <div key={u} className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono">{u}</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => copy(u, "Link copiat.")}><Copy className="size-3.5" /></Button>
                  </div>
                ))}
                {s.feedKeyHint ? <p className="text-muted-foreground">{s.feedKeyHint}</p> : null}
              </div>
            ) : null}

            {s.usesHabitooKey ? (
              <div className="space-y-2 rounded-lg border border-border p-3 text-sm" data-habitoo-keys>
                <p className="font-medium">Cheia Habitoo pentru {s.displayName}</p>
                {s.keys.length ? (
                  <ul className="divide-y divide-border">
                    {s.keys.map((k) => (
                      <li key={k.id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="min-w-0 flex-1 truncate">{k.label} · <span className="font-mono text-xs">{k.keyPrefix}…</span></span>
                        <span className="text-xs text-muted-foreground">{k.requestCount} cereri · {k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "nefolosită"}</span>
                        <Button type="button" size="sm" variant="ghost" className="text-destructive" aria-label="Revocă cheia" onClick={() => setConfirmRevoke(k.id)}><Trash2 className="size-3.5" /></Button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">Nicio cheie activă. Generează una și trimite-o portalului.</p>}
                <Button type="button" variant="outline" disabled={issue.isPending} onClick={() => issue.mutate()}>
                  <KeyRound className="mr-2 size-4" /> Generează cheie
                </Button>
                {freshKey ? (
                  <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
                    <p className="font-medium">Copiază cheia acum — nu se mai afișează.</p>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate text-xs">{freshKey.key}</code>
                      <Button type="button" size="sm" onClick={() => copy(freshKey.key, "Cheie copiată.")}><Copy className="size-3.5" /></Button>
                    </div>
                    {freshKey.feedUrl ? (
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate text-xs">{freshKey.feedUrl}</code>
                        <Button type="button" size="sm" onClick={() => copy(freshKey.feedUrl!, "Link copiat.")}><Copy className="size-3.5" /></Button>
                      </div>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setFreshKey(null)}>Am salvat-o</Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {s.instructions ? <p className="text-xs text-muted-foreground" data-portal-instructions>{s.instructions}</p> : null}

            <div className="flex flex-wrap gap-2">
              {s.fields.length ? (
                <Button type="button" variant="outline" disabled={busy || !dirty} onClick={() => save.mutate()}>
                  <Save className="mr-2 size-4" /> Salvează datele
                </Button>
              ) : null}
              {s.supportsConnectionTest ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => test.mutate()}>
                  <PlugZap className="mr-2 size-4" /> Testează conexiunea
                </Button>
              ) : null}
              {s.connection.activated ? (
                <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmDeactivate(true)}>
                  Dezactivează
                </Button>
              ) : (
                <Button type="button" disabled={busy} onClick={() => active.mutate(true)}>Activează portalul</Button>
              )}
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title="Dezactivezi portalul pentru agenție?"
        description="Agenția nu va mai putea publica pe acest portal, iar trimiterile reale către el se opresc. Dezactivarea nu retrage automat anunțurile publicate."
        confirmLabel="Dezactivează"
        destructive
        onConfirm={() => { active.mutate(false); setConfirmDeactivate(false); }}
      />
      <ConfirmDialog
        open={confirmRevoke !== null}
        onOpenChange={(o) => setConfirmRevoke(o ? confirmRevoke : null)}
        title="Revoci cheia?"
        description="Portalul nu va mai putea citi ofertele cu această cheie. Poți genera oricând una nouă."
        confirmLabel="Revocă"
        destructive
        onConfirm={() => { if (confirmRevoke) revoke.mutate(confirmRevoke); setConfirmRevoke(null); }}
      />
    </div>
  );
}
