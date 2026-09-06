import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, PlugZap, Save, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  disconnectPortalIntegration,
  getPortalIntegrations,
  savePortalIntegration,
  testPortalIntegration,
  type PortalCardData,
} from "@/lib/portals.functions";

const portalsKey = ["portal-integrations"] as const;

const STATUS_LABEL: Record<PortalCardData["status"], { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  not_configured: { label: "Neconfigurat", tone: "neutral" },
  ready: { label: "Pregătit pentru conectare", tone: "warning" },
  active: { label: "Activ", tone: "success" },
  error: { label: "Eroare", tone: "danger" },
};

export function PortalsCard() {
  const queryClient = useQueryClient();
  const loadPortals = useServerFn(getPortalIntegrations);
  const runSave = useServerFn(savePortalIntegration);
  const runDisconnect = useServerFn(disconnectPortalIntegration);
  const runTest = useServerFn(testPortalIntegration);

  const [agencyId, setAgencyId] = useState<Record<string, string>>({});
  const [credential, setCredential] = useState<Record<string, string>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const portals = useQuery({ queryKey: portalsKey, queryFn: () => loadPortals({}) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: portalsKey });

  const save = useMutation({
    mutationFn: (input: { portalKey: string; enabled?: boolean }) =>
      runSave({
        data: {
          portalKey: input.portalKey,
          externalAgencyId: agencyId[input.portalKey]?.trim() || undefined,
          credential: credential[input.portalKey]?.trim() || undefined,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        },
      }),
    onSuccess: (_res, input) => {
      setCredential((prev) => ({ ...prev, [input.portalKey]: "" }));
      invalidate();
      toast.success("Configurarea portalului a fost salvată.");
    },
    onError: (e: Error) => toastError(e),
  });

  const disconnect = useMutation({
    mutationFn: (portalKey: string) => runDisconnect({ data: { portalKey } }),
    onSuccess: () => {
      invalidate();
      toast.success("Portalul a fost deconectat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const test = useMutation({
    mutationFn: (portalKey: string) => runTest({ data: { portalKey } }),
    onSuccess: (res) => {
      if (res.ready) {
        toast.success("Configurarea este completă. Notificarea rămâne în simulare până la acceptarea Habitoo de către portal.");
      } else if (res.reason === "not_configured") {
        toast.error("Completează identificatorul agenției și tokenul primit de la portal.");
      } else if (res.reason === "disabled") {
        toast.message("Integrarea este configurată, dar dezactivată.");
      } else {
        toast.error("Portalul nu poate fi verificat momentan.");
      }
    },
    onError: (e: Error) => toastError(e),
  });

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Link copiat.");
    } catch {
      toast.error("Copierea nu a funcționat. Selectează manual textul.");
    }
  };

  if (portals.isLoading) return <InlineLoading label="Se încarcă portalurile…" />;
  if (portals.isError) return <QueryError error={portals.error} onRetry={() => portals.refetch()} />;

  return (
    <div className="space-y-4">
      {(portals.data ?? []).map((portal) => {
        const status = STATUS_LABEL[portal.status];
        return (
          <div key={portal.key} className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-medium">
                  {portal.name}
                  <a
                    href={portal.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Deschide ${portal.name}`}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </h3>
                <p className="text-sm text-muted-foreground">{portal.description}</p>
              </div>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Oferte publicabile</dt>
                <dd>{portal.eligibleProperties}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Acces la feed</dt>
                <dd>{portal.hasFeedToken ? "Token activ" : "Fără token — generează unul mai jos"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Credențiale portal</dt>
                <dd>
                  {portal.hasCredential
                    ? `Salvate (${portal.credentialPrefix ?? "••"}…)`
                    : "Nesalvate"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ultima sincronizare</dt>
                <dd>{portal.lastSyncAt ? formatDateTime(portal.lastSyncAt) : "Niciodată"}</dd>
              </div>
            </dl>

            {portal.lastError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {portal.lastError}
                {portal.lastErrorAt ? ` (${formatDateTime(portal.lastErrorAt)})` : ""}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${portal.key}-agency`}>Identificator agenție la portal</Label>
                <Input
                  id={`${portal.key}-agency`}
                  value={agencyId[portal.key] ?? portal.externalAgencyId ?? ""}
                  onChange={(e) => setAgencyId((prev) => ({ ...prev, [portal.key]: e.target.value }))}
                  placeholder="Primit de la portal"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${portal.key}-token`}>Token portal</Label>
                <Input
                  id={`${portal.key}-token`}
                  type="password"
                  autoComplete="off"
                  value={credential[portal.key] ?? ""}
                  onChange={(e) => setCredential((prev) => ({ ...prev, [portal.key]: e.target.value }))}
                  placeholder={portal.hasCredential ? "Salvat — completează pentru a-l înlocui" : "Primit de la portal"}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs">
              <span className="truncate font-mono">{portal.feedBaseUrl}/properties</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => copy(`${portal.feedBaseUrl}/properties`)}>
                <Copy className="size-3.5" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => save.mutate({ portalKey: portal.key })}
                disabled={save.isPending}
              >
                <Save className="mr-2 size-4" />
                Salvează
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => save.mutate({ portalKey: portal.key, enabled: !portal.enabled })}
                disabled={save.isPending || portal.status === "not_configured"}
              >
                {portal.enabled ? "Dezactivează" : "Activează"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => test.mutate(portal.key)}
                disabled={test.isPending}
              >
                <PlugZap className="mr-2 size-4" />
                Verifică configurarea
              </Button>
              {portal.hasCredential || portal.externalAgencyId ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setConfirmKey(portal.key)}
                >
                  <Unplug className="mr-2 size-4" />
                  Deconectează
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              Notificările automate către portal rămân în simulare până când portalul acceptă
              Habitoo ca sursă de oferte și confirmă credențialele reale.
            </p>
          </div>
        );
      })}

      <ConfirmDialog
        open={confirmKey !== null}
        onOpenChange={(open) => setConfirmKey(open ? confirmKey : null)}
        title="Deconectezi portalul?"
        description="Credențialele salvate vor fi șterse, iar integrarea revine la starea Neconfigurat."
        confirmLabel="Deconectează"
        destructive
        onConfirm={() => {
          if (confirmKey) disconnect.mutate(confirmKey);
          setConfirmKey(null);
        }}
      />
    </div>
  );
}
