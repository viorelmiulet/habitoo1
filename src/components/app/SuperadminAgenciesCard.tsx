import { Link, useNavigate } from "@tanstack/react-router";
import { ListSkeleton } from "@/components/app/LoadingState";
import { formatNumber } from "@/lib/format";
import { expiryCell, lastLoginCell, type AgencyDot, type AgencyRow } from "@/lib/superadmin-agencies";
import { cn } from "@/lib/utils";

const dotCls: Record<AgencyDot, string> = { red: "bg-destructive", gold: "bg-gold", green: "bg-success" };
const pill = "inline-flex rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap";

export function AgenciesCard({ rows, loading }: { rows: AgencyRow[] | undefined; loading: boolean }) {
  const navigate = useNavigate();
  const now = Date.now();
  const open = (id: string) => void navigate({ to: "/superadmin/agencies/$id", params: { id } });
  return (
    <section className="min-w-0 overflow-hidden rounded-[14px] border border-border bg-surface" data-testid="superadmin-agencies">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-base font-bold">Agenții</h2>
        <Link to="/superadmin/agencies" className="text-sm font-semibold text-gold-dark hover:underline">
          Toate agențiile
        </Link>
      </header>
      {loading || !rows ? (
        <ListSkeleton rows={4} compact />
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Nicio agenție activă.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {["Agenție", "Abonament", "Expiră", "Utiliz.", "Proprietăți", "Portaluri", "Conexiuni", "Ultima logare"].map((h, i) => (
                  <th key={h} className={cn("px-4 py-2.5 font-semibold whitespace-nowrap", i >= 3 && i <= 6 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const exp = expiryCell(r.expiresAt, now);
                const login = lastLoginCell(r.lastLoginAt, now);
                return (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    role="link"
                    aria-label={`Deschide agenția ${r.name}`}
                    onClick={() => open(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(r.id);
                      }
                    }}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className={cn("size-2 shrink-0 rounded-full", dotCls[r.dot])} aria-hidden />
                        <span className="truncate">{r.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.subscription}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {exp.tone === "warning" ? (
                        <span className={cn(pill, "bg-gold-tint text-gold-dark")}>{exp.text}</span>
                      ) : exp.tone === "error" ? (
                        <span className={cn(pill, "bg-danger-tint text-destructive")}>{exp.text}</span>
                      ) : (
                        <span className={exp.tone === "none" ? "text-muted-foreground" : ""}>{exp.text}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.users)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.activeProperties)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.portals)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.connectionErrors > 0 ? <span className={cn(pill, "bg-danger-tint text-destructive")}>{formatNumber(r.connectionErrors)} cu eroare</span> : "OK"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {login.main}
                      {login.ago ? <span className="text-muted-foreground"> · {login.ago}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="flex flex-wrap gap-x-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <span><span className="text-success">●</span> activă</span>
        <span><span className="text-gold">●</span> fără proprietăți</span>
        <span><span className="text-destructive">●</span> inactivă de peste 14 zile</span>
      </p>
    </section>
  );
}
