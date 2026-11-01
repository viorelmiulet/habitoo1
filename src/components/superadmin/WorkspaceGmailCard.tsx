/**
 * Panou compact pentru SuperAdmin: adresa Gmail a Habitoos, conectată la
 * workspace. Citirea se face pe server, prin gateway; aici ajunge doar
 * adresa și numărătorile.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkspaceGmailStatus } from "@/lib/gmail/gmail-workspace.functions";

export function WorkspaceGmailCard() {
  const load = useServerFn(getWorkspaceGmailStatus);
  const q = useQuery({
    queryKey: ["workspace-gmail"],
    queryFn: () => load({}),
    staleTime: 30_000,
  });

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium">Gmail Habitoo</p>
          {q.isLoading ? (
            <Skeleton className="mt-1 h-3.5 w-40" />
          ) : q.isError || !q.data ? (
            <p className="text-muted-foreground">Starea nu a putut fi citită.</p>
          ) : !q.data.configured ? (
            <p className="text-muted-foreground">
              Nu este configurat. Lipsesc: {q.data.missing.join(", ") || "—"}.
            </p>
          ) : q.data.checkFailed || !q.data.profile ? (
            <p className="text-muted-foreground">
              Configurarea există, dar adresa nu a putut fi citită de la Google.
            </p>
          ) : (
            <p className="truncate text-muted-foreground">
              {q.data.profile.email} · {q.data.profile.messagesTotal} mesaje ·{" "}
              {q.data.profile.threadsTotal} conversații.
            </p>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void q.refetch()}
        disabled={q.isFetching}
      >
        <RefreshCw className="mr-1.5 h-4 w-4" /> Verifică
      </Button>
    </div>
  );
}
