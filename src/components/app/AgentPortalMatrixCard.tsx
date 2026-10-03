import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { cn } from "@/lib/utils";
import { getAgentPortalMatrix } from "@/lib/agent-portal-preferences.functions";

const CELL_LABEL = {
  chosen: "ales",
  not_chosen: "nealeasă",
  disconnected: "portal deconectat",
} as const;

/** „Portaluri pe agent”: doar citire, pentru administratorul agenției. */
export function AgentPortalMatrixCard() {
  const load = useServerFn(getAgentPortalMatrix);
  const query = useQuery({ queryKey: ["agent-portal-matrix"], queryFn: () => load({}) });
  const data = query.data;

  return (
    <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-6">
      <h2 className="font-display text-lg font-semibold">Portaluri pe agent</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ce portaluri a ales fiecare agent pentru anunțurile lui noi. Doar pentru citire.
      </p>

      {query.isLoading ? (
        <InlineLoading />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => query.refetch()} />
      ) : data && data.agents.length > 0 ? (
        <div className="mt-4 max-w-full overflow-x-auto rounded-lg border">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium"
                >
                  Agent
                </th>
                {data.portals.map((p) => (
                  <th key={p.id} scope="col" className="px-2 py-2 text-center font-medium">
                    <div className="flex flex-col items-center gap-1">
                      <PortalLogoStack portalId={p.id} name={p.name} size={24} />
                      <span className="max-w-[96px] text-xs leading-tight">{p.name}</span>
                    </div>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Alese
                </th>
              </tr>
            </thead>
            <tbody>
              {data.agents.map((a) => (
                <tr key={a.id} className="border-t">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-[160px] truncate bg-card px-3 py-2 text-left font-medium"
                  >
                    {a.name}
                  </th>
                  {data.portals.map((p) => {
                    const state = a.cells[p.id];
                    const label = `${a.name}, ${p.name}: ${CELL_LABEL[state]}`;
                    return (
                      <td key={p.id} className="px-2 py-2 text-center">
                        <span
                          role="img"
                          aria-label={label}
                          title={label}
                          className={cn(
                            "mx-auto flex h-7 w-7 items-center justify-center rounded-md text-xs",
                            state === "chosen" && "bg-gold text-gold-foreground",
                            state === "not_chosen" && "border-2 border-border",
                            state === "disconnected" && "bg-muted text-muted-foreground",
                          )}
                        >
                          {state === "chosen" ? (
                            <Check className="h-4 w-4" aria-hidden />
                          ) : state === "disconnected" ? (
                            <span aria-hidden>–</span>
                          ) : null}
                        </span>
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-muted-foreground">
                    {a.chosen === null ? "Nicio alegere încă" : `${a.chosen} din ${a.available}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Nu există agenți activi.</p>
      )}
    </section>
  );
}
