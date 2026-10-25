import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Link2Off, PlugZap } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  disconnectArgus,
  getArgusConnectionStatus,
  saveArgusApiKey,
  testArgusConnection,
} from "@/lib/argus/argus.functions";

const KEY = ["argus-connection"] as const;

export function ArgusConnectionCard() {
  const qc = useQueryClient();
  const load = useServerFn(getArgusConnectionStatus);
  const save = useServerFn(saveArgusApiKey);
  const test = useServerFn(testArgusConnection);
  const disconnect = useServerFn(disconnectArgus);
  const [apiKey, setApiKey] = useState("");
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: KEY, queryFn: () => load() });

  const saveMutation = useMutation({
    mutationFn: (key: string) => save({ data: { apiKey: key } }),
    onSuccess: () => {
      setApiKey("");
      toast.success("Cheia API Argus a fost salvată.");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: unknown) => toastError(e),
  });

  const testMutation = useMutation({
    mutationFn: (_: void) => test(),
    onSuccess: (r) => {
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    },
    onError: (e: unknown) => toastError(e),
  });

  const dropMutation = useMutation({
    mutationFn: (_: void) => disconnect(),
    onSuccess: () => {
      toast.success("Conexiunea Argus a fost ștearsă.");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: unknown) => toastError(e),
  });

  if (q.isLoading)
    return (
      <div className="panel p-5">
        <InlineLoading />
      </div>
    );
  if (q.isError || !q.data) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;

  return (
    <div className="panel min-w-0 space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium">Argus</h3>
            <p className="text-sm text-muted-foreground">
              Conectează cheia API Argus a agenției pentru datele de piață. Cheia rămâne pe server
              și nu este afișată niciodată complet.
            </p>
          </div>
        </div>
        {d.connected ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => testMutation.mutate(undefined)}
              disabled={testMutation.isPending}
            >
              <PlugZap className="size-4" /> Testează conexiunea
            </Button>
            <Button variant="outline" onClick={() => setConfirm(true)} disabled={dropMutation.isPending}>
              <Link2Off className="size-4" /> Deconectează
            </Button>
          </div>
        ) : null}
      </div>

      {!d.configured ? (
        <p className="text-sm text-muted-foreground">
          Integrarea Argus nu este activată încă pe platformă. Revino mai târziu.
        </p>
      ) : null}

      {d.connected ? (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="font-medium">
              Conectat <span className="text-muted-foreground">(cheie ••••{d.last4})</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {d.connectedByName ? `Adăugată de ${d.connectedByName}` : "Cheie salvată"}
              {d.connectedAt ? ` pe ${formatDateTime(d.connectedAt)}` : ""}.
            </p>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (apiKey.trim()) saveMutation.mutate(apiKey.trim());
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            placeholder="Cheia API Argus"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="max-w-sm"
          />
          <Button type="submit" disabled={!apiKey.trim() || saveMutation.isPending || !d.configured}>
            Salvează cheia
          </Button>
        </form>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Deconectezi Argus?"
        description="Cheia API a agenției se șterge definitiv din Habitoo."
        confirmLabel="Deconectează"
        destructive
        onConfirm={() => dropMutation.mutate(undefined)}
      />
    </div>
  );
}
