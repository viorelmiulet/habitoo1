import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2Off, RefreshCw, Youtube } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { disconnectYoutube, getYoutubeOverview, startYoutubeConnect } from "@/lib/youtube/youtube.functions";

const KEY = ["youtube-overview"] as const;
const ERRORS: Record<string, string> = {
  config: "Conectarea YouTube nu este configurată încă.",
  invalid_state: "Cererea de conectare a expirat sau nu este validă. Încearcă din nou.",
  denied: "Conectarea a fost anulată în Google.",
  no_channel: "Contul Google ales nu are un canal YouTube.",
  exchange_failed: "Canalul YouTube nu a putut fi conectat. Încearcă din nou.",
};

export function YoutubeConnectionCard() {
  const qc = useQueryClient();
  const load = useServerFn(getYoutubeOverview);
  const start = useServerFn(startYoutubeConnect);
  const disconnect = useServerFn(disconnectYoutube);
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: KEY, queryFn: () => load() });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const err = p.get("yt_error");
    if (err) toast.error(ERRORS[err] ?? ERRORS.exchange_failed);
    else if (p.get("yt") === "connected") toast.success("Canalul YouTube a fost conectat.");
    if (err || p.get("yt")) {
      ["yt", "yt_error"].forEach((k) => p.delete(k));
      const qs = p.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, []);

  const connect = useMutation({
    mutationFn: (_: void) => start(),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (e: unknown) => toastError(e),
  });
  const drop = useMutation({
    mutationFn: (_: void) => disconnect(),
    onSuccess: () => {
      toast.success("Canalul YouTube a fost deconectat.");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: unknown) => toastError(e),
  });

  if (q.isLoading) return <div className="panel p-5"><InlineLoading /></div>;
  if (q.isError || !q.data) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const connected = d.status === "connected";

  return (
    <div className="panel min-w-0 space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Youtube className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium">YouTube</h3>
            <p className="text-sm text-muted-foreground">Conectează canalul YouTube al agenției ca să publici video-urile proprietăților.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => connect.mutate(undefined)} disabled={!d.configured || connect.isPending}>
            {connected ? <RefreshCw className="size-4" /> : <Youtube className="size-4" />}
            {connected ? "Reconectează" : "Conectează YouTube"}
          </Button>
          {connected ? (
            <Button variant="outline" onClick={() => setConfirm(true)} disabled={drop.isPending}>
              <Link2Off className="size-4" /> Deconectează
            </Button>
          ) : null}
        </div>
      </div>

      {!d.configured ? <p className="text-sm text-muted-foreground">{ERRORS.config}</p> : null}

      {connected && d.channel ? (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          {d.channel.thumbnail ? (
            <img src={d.channel.thumbnail} alt={`Poza canalului ${d.channel.title ?? ""}`} className="size-10 rounded-full border object-cover" referrerPolicy="no-referrer" />
          ) : <div aria-hidden className="size-10 rounded-full bg-muted" />}
          <div className="min-w-0">
            <p className="truncate font-medium">{d.channel.title}</p>
            <p className="text-sm text-muted-foreground">
              Conectat{d.connectedByName ? ` de ${d.connectedByName}` : ""}{d.connectedAt ? ` pe ${formatDateTime(d.connectedAt)}` : ""}.
            </p>
          </div>
        </div>
      ) : d.status === "expired" ? (
        <p className="text-sm text-destructive">Reconectează canalul YouTube din Setări → Promovare.</p>
      ) : d.status === "disconnected" ? (
        <p className="text-sm text-muted-foreground">Canalul a fost deconectat. Reconectează pentru a-l folosi din nou.</p>
      ) : null}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Deconectezi canalul YouTube?"
        description="Accesul se revocă la Google și se șterge din Habitoo."
        confirmLabel="Deconectează"
        destructive
        onConfirm={() => drop.mutate(undefined)}
      />
    </div>
  );
}
