import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { cn } from "@/lib/utils";
import { PORTAL_CONNECTION_LABEL } from "@/lib/portals/registry";
import { getMyPortals, saveMyPortals } from "@/lib/agent-portal-preferences.functions";

const DOT: Record<string, string> = {
  success: "bg-success",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground",
};

export function MyPortalsCard() {
  const queryClient = useQueryClient();
  const load = useServerFn(getMyPortals);
  const save = useServerFn(saveMyPortals);
  const query = useQuery({ queryKey: ["my-portals"], queryFn: () => load({}) });
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (query.data) setChosen(new Set(query.data.filter((p) => p.selected).map((p) => p.id)));
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { portalKeys: [...chosen] } }),
    onSuccess: () => {
      toast.success("Alegerea a fost salvată.");
      void queryClient.invalidateQueries({ queryKey: ["my-portals"] });
    },
    onError: () => toast.error("Alegerea nu a fost salvată. Încearcă din nou."),
  });

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const items = query.data ?? [];
  const count = items.filter((p) => chosen.has(p.id) && p.status !== "disconnected").length;

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Portalurile mele</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Atinge portalurile pe care publici de obicei. Se preselectează la anunțurile tale noi,
            iar în fila Publicare le poți schimba oricând, pentru fiecare anunț.
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
          {count} {count === 1 ? "portal ales" : "portaluri alese"}
        </span>
      </div>

      {query.isLoading ? (
        <InlineLoading />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => {
            const disabled = p.status === "disconnected";
            const selected = chosen.has(p.id) && !disabled;
            const tone = PORTAL_CONNECTION_LABEL[p.status];
            return (
              <button
                key={p.id}
                type="button"
                role="checkbox"
                aria-checked={selected}
                aria-label={p.name}
                disabled={disabled}
                onClick={() => toggle(p.id)}
                className={cn(
                  "relative flex min-h-[88px] min-w-0 items-center gap-3 rounded-lg border-2 p-3 pr-14 text-left transition-colors",
                  selected ? "border-gold bg-gold/5" : "border-border hover:border-gold/50",
                  disabled && "cursor-not-allowed opacity-50 hover:border-border",
                )}
              >
                <PortalLogoStack portalId={p.id} name={p.name} size={36} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", DOT[tone.tone])} aria-hidden />
                    {tone.label}
                  </div>
                  {disabled ? (
                    <p className="mt-1 text-xs text-muted-foreground">Agenția nu l-a conectat încă.</p>
                  ) : p.status === "error" ? (
                    <p className="mt-1 text-xs text-destructive">
                      Conexiune cu eroare. Anunță administratorul.
                    </p>
                  ) : null}
                </div>
                <span className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center">
                  <Checkbox checked={selected} tabIndex={-1} aria-hidden className="pointer-events-none" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Portalurile se conectează de administratorul agenției. Alegerea ta nu schimbă ce poate
          publica agenția.
        </p>
        <Button
          className="min-h-11"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || query.isLoading}
        >
          Salvează alegerea
        </Button>
      </div>
    </section>
  );
}
