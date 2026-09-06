import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound, PlugZap, ShieldOff } from "lucide-react";
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
  generateSiteFeedToken,
  getSiteFeedStatus,
  revokeSiteFeedToken,
  testSiteFeed,
} from "@/lib/site-feed.functions";

const feedStatusKey = ["site-feed-status"] as const;

export function SiteFeedCard() {
  const queryClient = useQueryClient();
  const loadStatus = useServerFn(getSiteFeedStatus);
  const runGenerate = useServerFn(generateSiteFeedToken);
  const runRevoke = useServerFn(revokeSiteFeedToken);
  const runTest = useServerFn(testSiteFeed);

  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const status = useQuery({
    queryKey: feedStatusKey,
    queryFn: () => loadStatus({}),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: feedStatusKey });

  const generate = useMutation({
    mutationFn: () => runGenerate({ data: {} }),
    onSuccess: (res) => {
      setPlainToken(res.token);
      invalidate();
      toast.success("Token generat. Copiază-l acum — nu va mai fi afișat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const revoke = useMutation({
    mutationFn: () => runRevoke({}),
    onSuccess: () => {
      setPlainToken(null);
      invalidate();
      toast.success("Accesul la feed a fost revocat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const test = useMutation({
    mutationFn: () => runTest({}),
    onSuccess: (res) => {
      toast.success(
        res.hasToken
          ? `Conexiune pregătită: ${res.properties} proprietăți publicabile, ${res.agents} agenți activi.`
          : "Generează mai întâi un token de acces.",
      );
    },
    onError: (e: Error) => toastError(e),
  });

  if (status.isLoading) return <InlineLoading label="Se încarcă integrarea…" />;
  if (status.isError) return <QueryError error={status.error} onRetry={() => status.refetch()} />;

  const data = status.data;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const base = `${origin}${data?.basePath ?? ""}`;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiat.`);
    } catch {
      toast.error("Copierea nu a funcționat. Selectează manual textul.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">Feed pentru site-ul agenției</h3>
            <p className="text-sm text-muted-foreground">
              Un token de acces permite site-ului agenției să citească ofertele
              publicate și să trimită înapoi cereri de contact.
            </p>
          </div>
          <StatusBadge tone={data?.token ? "success" : "neutral"}>
            {data?.token ? "Activ" : "Neconfigurat"}
          </StatusBadge>
        </div>

        {data?.token ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Identificator token</dt>
              <dd className="font-mono">{data.token.tokenPrefix}…</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Creat</dt>
              <dd>{formatDateTime(data.token.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ultima folosire</dt>
              <dd>{data.token.lastUsedAt ? formatDateTime(data.token.lastUsedAt) : "Niciodată"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cereri servite</dt>
              <dd>{data.token.requestCount}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nu există încă un token activ pentru agenția ta.
          </p>
        )}

        {plainToken ? (
          <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-4">
            <Label htmlFor="feed-token">Token nou (se afișează o singură dată)</Label>
            <div className="flex gap-2">
              <Input id="feed-token" readOnly value={plainToken} className="font-mono text-xs" />
              <Button type="button" variant="outline" onClick={() => copy(plainToken, "Tokenul")}>
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => generate.mutate()} disabled={generate.isPending}>
            <KeyRound className="mr-2 size-4" />
            {data?.token ? "Generează token nou" : "Generează token"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => test.mutate()}
            disabled={test.isPending}
          >
            <PlugZap className="mr-2 size-4" />
            Testează conexiunea
          </Button>
          {data?.token ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmRevoke(true)}
            >
              <ShieldOff className="mr-2 size-4" />
              Revocă accesul
            </Button>
          ) : null}
        </div>
      </div>

      <div className="panel space-y-3 p-5 text-sm">
        <h3 className="font-medium">Adrese de integrare</h3>
        <p className="text-muted-foreground">
          Trimite tokenul în antetul <span className="font-mono">Authorization: Bearer …</span>.
        </p>
        <ul className="space-y-2 font-mono text-xs">
          {[
            ["GET", "/properties"],
            ["GET", "/properties/{id}"],
            ["GET", "/agents"],
            ["POST", "/contacts"],
            ["POST", "/visits"],
          ].map(([method, path]) => (
            <li key={path} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="truncate">
                <span className="text-muted-foreground">{method}</span> {base}
                {path}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => copy(`${base}${path}`, "Linkul")}
              >
                <Copy className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel p-5">
        <h3 className="mb-3 font-medium">Ultimele accesări</h3>
        {data && data.logs.length > 0 ? (
          <ul className="divide-y divide-border text-sm">
            {data.logs.map((log, i) => (
              <li key={`${log.createdAt}-${i}`} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-mono text-xs text-muted-foreground">{log.method}</span>
                <span className="min-w-0 flex-1 truncate">{log.endpoint}</span>
                <StatusBadge tone={log.status < 300 ? "success" : log.status < 500 ? "warning" : "danger"}>
                  {log.status}
                </StatusBadge>
                <span className="text-xs text-muted-foreground">
                  {log.items ?? 0} el. · {formatDateTime(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nicio accesare înregistrată încă.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Revoci accesul la feed?"
        description="Site-ul conectat nu va mai putea citi ofertele până când generezi un token nou."
        confirmLabel="Revocă"
        destructive
        onConfirm={() => revoke.mutate()}
      />
    </div>
  );
}
