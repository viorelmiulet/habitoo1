import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2Off, Mail, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { toastError } from "@/lib/errors";
import {
  completeGmailConnect,
  disconnectGmail,
  getGmailStatus,
  startGmailConnect,
} from "@/lib/gmail/gmail-user.functions";

const KEY = ["gmail-status"] as const;
const CONNECTOR_ID = "google_mail";

/**
 * Ascultă finalizarea consimțământului în fereastra pop-up.
 *
 * Pop-up-ul postește doar un cod de unică folosință, pe aceeași origine;
 * schimbul lui în cheia de conexiune se face în server function, aici, în
 * fereastra care are sesiunea aplicației.
 */
function waitForOAuthCompletion(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== CONNECTOR_ID ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      ) {
        return;
      }
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("Conectarea Gmail a eșuat."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("Fereastra de conectare a fost închisă înainte de finalizare."));
    }, 500);
  });
}

export function GmailConnectionCard() {
  const qc = useQueryClient();
  const load = useServerFn(getGmailStatus);
  const start = useServerFn(startGmailConnect);
  const complete = useServerFn(completeGmailConnect);
  const disconnect = useServerFn(disconnectGmail);
  const [confirm, setConfirm] = useState(false);
  const busyRef = useRef(false);

  const q = useQuery({ queryKey: KEY, queryFn: () => load() });

  const connect = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const popup = window.open("", "lovable-gmail-oauth", "width=600,height=720");
    if (!popup) {
      busyRef.current = false;
      throw new Error("Permiteți deschiderea ferestrelor pop-up și încercați din nou.");
    }
    let code: string | null;
    try {
      const { authorizationUrl } = await start();
      const completion = waitForOAuthCompletion(popup);
      popup.location.href = authorizationUrl;
      code = await completion;
    } catch (e) {
      popup.close();
      busyRef.current = false;
      throw e;
    }
    // Schimbul se face aici, nu în pop-up: în previzualizare pop-up-ul nu are
    // sesiunea aplicației, iar funcția de server ar eșua.
    try {
      if (code) await complete({ data: { code } });
    } finally {
      busyRef.current = false;
    }
    toast.success("Contul tău Gmail este conectat.");
    void qc.invalidateQueries({ queryKey: KEY });
  }, [qc, start, complete]);

  const connectMutation = useMutation({ mutationFn: connect, onError: (e: unknown) => toastError(e) });

  const drop = useMutation({
    mutationFn: (_: void) => disconnect(),
    onSuccess: () => {
      toast.success("Conectarea Gmail a fost eliminată.");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: unknown) => toastError(e),
  });

  // Un consimțământ poate fi reluat dintr-o fereastră deja deschisă; orice
  // mesaj primit de pe aceeași origine este tratat de waitForOAuthCompletion.
  useEffect(() => () => void (busyRef.current = false), []);

  if (q.isLoading) return <div className="panel p-5"><InlineLoading /></div>;
  if (q.isError || !q.data) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const connected = d.connected;
  const needsReconnect = !connected && d.reconnectRequired;

  return (
    <div className="panel min-w-0 space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium">Gmail</h3>
            <p className="text-sm text-muted-foreground">
              Conectează contul tău Gmail ca să-ți vezi mesajele și să trimiți din aplicație.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending || drop.isPending}
          >
            {connected || needsReconnect ? (
              <RefreshCw className="size-4" />
            ) : (
              <Mail className="size-4" />
            )}
            {connected ? "Reconectează Gmail" : needsReconnect ? "Reconectează Gmail" : "Conectează Gmail"}
          </Button>
          {connected ? (
            <Button variant="outline" onClick={() => setConfirm(true)} disabled={drop.isPending}>
              <Link2Off className="size-4" /> Deconectează
            </Button>
          ) : null}
        </div>
      </div>

      {connected ? (
        <div className="rounded-lg border p-3">
          <p className="truncate font-medium">{d.email}</p>
          <p className="text-sm text-muted-foreground">
            {d.messagesTotal} mesaje · {d.threadsTotal} conversații.
          </p>
        </div>
      ) : needsReconnect ? (
        <p className="text-sm text-destructive">
          Accesul tău la Gmail trebuie reînnoit. Apasă „Reconectează Gmail".
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Contul tău Gmail nu este conectat încă.
        </p>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Deconectezi Gmail?"
        description="Accesul se revocă la Google și cheia ta dispare din Habitoo."
        confirmLabel="Deconectează"
        destructive
        onConfirm={() => drop.mutate(undefined)}
      />
    </div>
  );
}
