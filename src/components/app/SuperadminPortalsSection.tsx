import { Link } from "@tanstack/react-router";
import { PortalLogo } from "@/components/app/PortalLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { getPortalDefinition } from "@/lib/portals/registry";
import { agenciesLabel, errorsPill, publishedLabel, type PortalCard } from "@/lib/superadmin-portals";
import type { SuperadminTodo } from "@/lib/superadmin-todo";
import { cn } from "@/lib/utils";

export function PortalsSection({ portals, todo, loading }: { portals: PortalCard[] | undefined; todo: SuperadminTodo | undefined; loading: boolean }) {
  const totalErrors = todo?.blocked.reduce((n, b) => n + b.total, 0) ?? 0;
  const notPublishable = todo?.blocked.reduce((n, b) => n + b.notPublishable, 0) ?? 0;
  return (
    <section className="min-w-0 rounded-[14px] border border-border bg-surface" data-testid="superadmin-portals">
      <header className="space-y-1 border-b border-border px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">Portaluri</h2>
          <Link to="/superadmin/portals" className="text-sm font-semibold text-gold-dark hover:underline">
            Configurări
          </Link>
        </div>
        {todo ? (
          <p className="text-[13px] text-muted-foreground">
            Conexiuni cu eroare: {todo.counts.failingConnections}.
            {totalErrors > 0 ? ` ${notPublishable} din cele ${totalErrors} erori vin din anunțuri nepublicate în CRM, nu din portaluri.` : ""}
          </p>
        ) : null}
      </header>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !portals ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)
        ) : portals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nicio conexiune de portal activată.</p>
        ) : (
          portals.map((p) => {
            const name = getPortalDefinition(p.portal)?.display_name ?? p.portal;
            const pill = errorsPill(p.errors);
            return (
              <div key={p.portal} className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3">
                <PortalLogo portalId={p.portal} name={name} className="size-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {agenciesLabel(p.agencies)} · {publishedLabel(p)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap",
                    pill.tone === "error" ? "bg-danger-tint text-destructive" : "bg-success/15 text-success",
                  )}
                >
                  {pill.text}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
