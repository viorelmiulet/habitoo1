import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Facebook, Instagram, Link2Off, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  disconnectMetaConnection,
  getMetaOverview,
  setDefaultMetaPage,
  startMetaConnect,
} from "@/lib/meta/meta.functions";
import { META_ERROR_MESSAGES, META_NO_INSTAGRAM_MESSAGE } from "@/lib/meta/messages";

const KEY = ["meta-overview"] as const;

function Avatar({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    <img src={src} alt={alt} className="size-10 shrink-0 rounded-full border object-cover" referrerPolicy="no-referrer" />
  ) : (
    <div aria-hidden className="size-10 shrink-0 rounded-full bg-muted" />
  );
}

export function MetaConnectionCard() {
  const qc = useQueryClient();
  const load = useServerFn(getMetaOverview);
  const start = useServerFn(startMetaConnect);
  const setDefault = useServerFn(setDefaultMetaPage);
  const disconnect = useServerFn(disconnectMetaConnection);
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: KEY, queryFn: () => load() });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const err = p.get("meta_error");
    if (err) toast.error(META_ERROR_MESSAGES[err] ?? META_ERROR_MESSAGES.exchange_failed);
    else if (p.get("meta") === "connected") toast.success("Facebook și Instagram au fost conectate.");
    if (err || p.get("meta")) {
      ["meta", "meta_error", "ig"].forEach((k) => p.delete(k));
      const qs = p.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, []);

  const connect = useMutation({
    mutationFn: (_: void) => start(),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: toastError,
  });
  const pick = useMutation({
    mutationFn: (pageId: string) => setDefault({ data: { pageId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: toastError,
  });
  const drop = useMutation({
    mutationFn: (_: void) => disconnect(),
    onSuccess: () => {
      toast.success("Facebook și Instagram au fost deconectate.");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: toastError,
  });

  if (q.isLoading) return <div className="panel p-5"><InlineLoading /></div>;
  if (q.isError || !q.data) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const connected = d.status === "connected";

  return (
    <div className="panel min-w-0 space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Facebook className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium">Facebook și Instagram</h3>
            <p className="text-sm text-muted-foreground">
              Conectează paginile de Facebook și conturile de Instagram Business ale agenției.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => connect.mutate(undefined)} disabled={!d.configured || connect.isPending}>
            {connected ? <RefreshCw className="size-4" /> : <Facebook className="size-4" />}
            {connected ? "Reconectează" : "Conectează Facebook și Instagram"}
          </Button>
          {connected ? (
            <Button variant="outline" onClick={() => setConfirm(true)} disabled={drop.isPending}>
              <Link2Off className="size-4" /> Deconectează
            </Button>
          ) : null}
        </div>
      </div>

      {!d.configured ? <p className="text-sm text-muted-foreground">{META_ERROR_MESSAGES.config}</p> : null}

      {connected ? (
        <>
          <p className="text-sm text-muted-foreground">
            Conectat{d.connectedByName ? ` de ${d.connectedByName}` : ""}
            {d.connectedAt ? ` pe ${formatDateTime(d.connectedAt)}` : ""}.
          </p>
          <ul className="divide-y rounded-lg border" role="radiogroup" aria-label="Pagina implicită">
            {d.pages.map((p) => (
              <li key={p.pageId} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar src={p.pictureUrl} alt={`Poza paginii ${p.name}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  {p.instagram ? (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Instagram className="size-4" />
                      {p.instagram.pictureUrl ? (
                        <img src={p.instagram.pictureUrl} alt="" className="size-5 rounded-full" referrerPolicy="no-referrer" />
                      ) : null}
                      @{p.instagram.username ?? p.instagram.id}
                    </p>
                  ) : (
                    <p className="text-sm text-warning">{META_NO_INSTAGRAM_MESSAGE}</p>
                  )}
                </div>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="meta-default-page"
                    className="size-4 accent-primary"
                    checked={d.defaultPageId === p.pageId}
                    onChange={() => pick.mutate(p.pageId)}
                    disabled={pick.isPending}
                  />
                  Pagina implicită
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : d.status === "disconnected" ? (
        <p className="text-sm text-muted-foreground">Conexiunea a fost întreruptă. Reconectează pentru a o folosi din nou.</p>
      ) : null}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Deconectezi Facebook și Instagram?"
        description="Accesul la pagini și la conturile de Instagram se șterge din Habitoo și se revocă la Facebook."
        confirmLabel="Deconectează"
        destructive
        onConfirm={() => drop.mutate(undefined)}
      />
    </div>
  );
}
