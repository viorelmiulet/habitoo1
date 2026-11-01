import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, Inbox, LifeBuoy, PlugZap, Unplug } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import {
  anunturiLabel,
  todoItemCount,
  zeroCategories,
  type SubscriptionAlert,
  type SuperadminTodo,
} from "@/lib/superadmin-todo";
import { cn } from "@/lib/utils";

type CountTo = "/superadmin/agencies" | "/superadmin/cereri-abonament" | "/superadmin/portals" | "/superadmin/support";

export function TodoBlock({ todo, loading }: { todo: SuperadminTodo | undefined; loading: boolean }) {
  return (
    <section className="space-y-3" data-testid="superadmin-todo">
      <h2 className="text-base font-bold">De rezolvat</h2>
      {loading || !todo ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-[14px]" />
          ))}
        </div>
      ) : (
        <TodoContent todo={todo} />
      )}
    </section>
  );
}

function TodoContent({ todo }: { todo: SuperadminTodo }) {
  const c = todo.counts;
  if (todoItemCount(todo) === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-success" /> Nimic de rezolvat
      </p>
    );
  }
  const zeros = zeroCategories(c);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {c.pendingRegistrations > 0 && <CountCard icon={Inbox} n={c.pendingRegistrations} label="cereri de înscriere în așteptare" to="/superadmin/agencies" />}
        {c.pendingSubscriptionRequests > 0 && <CountCard icon={CreditCard} n={c.pendingSubscriptionRequests} label="cereri de abonament în așteptare" to="/superadmin/cereri-abonament" />}
        {c.pendingPortalActivations > 0 && <CountCard icon={PlugZap} n={c.pendingPortalActivations} label="cereri de activare portal în așteptare" to="/superadmin/portals" />}
        {c.openTickets > 0 && <CountCard icon={LifeBuoy} n={c.openTickets} label="tichete de suport deschise sau în lucru" to="/superadmin/support" />}
        {todo.expiring.map((a) => <SubscriptionCard key={a.organizationId} alert={a} />)}
        {todo.expired.map((a) => <SubscriptionCard key={a.organizationId} alert={a} />)}
        {c.failingConnections > 0 && (
          <AccentCard tone="error">
            <CardTitle icon={Unplug}>{formatNumber(c.failingConnections)} {c.failingConnections === 1 ? "conexiune de portal are" : "conexiuni de portal au"} eroare de sincronizare</CardTitle>
            <p className="text-[13px] text-muted-foreground">Conexiuni activate pentru agenții.</p>
            <Actions><Link className={actionCls} to="/superadmin/portals">Portaluri</Link></Actions>
          </AccentCard>
        )}
        {todo.blocked.map((b) => (
          <AccentCard key={b.organizationId} tone="error">
            <CardTitle icon={AlertTriangle}>{anunturiLabel(b.total)} nu pot fi publicate · {b.organizationName}</CardTitle>
            <p className="text-[13px] text-muted-foreground">
              {formatNumber(b.notPublishable)} „Oferta nu este publicabilă” (nepublicate în CRM) · {formatNumber(b.other)} alte erori
            </p>
            <Actions>
              <Link className={actionCls} to="/superadmin/portal-logs" search={{ org: b.organizationId, status: "error" }}>Jurnal portaluri</Link>
              <Link className={actionCls} to="/superadmin/agencies/$id" params={{ id: b.organizationId }}>Deschide agenția</Link>
            </Actions>
          </AccentCard>
        ))}
      </div>
      {zeros.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span>Nimic în așteptare:</span>
          {zeros.map((z) => (
            <span key={z} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{z}</span>
          ))}
        </p>
      )}
    </>
  );
}

function CountCard({ icon: Icon, n, label, to }: { icon: LucideIcon; n: number; label: string; to: CountTo }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-4 transition-colors hover:border-gold/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Icon className="size-5" /></span>
      <span className="min-w-0">
        <span className="block text-2xl font-extrabold tabular-nums">{formatNumber(n)}</span>
        <span className="block text-[13px] text-muted-foreground">{label}</span>
      </span>
    </Link>
  );
}

function SubscriptionCard({ alert: a }: { alert: SubscriptionAlert }) {
  const days = Math.abs(a.daysLeft);
  const when = a.expired
    ? days === 0 ? "expirat azi" : `expirat de ${days} ${days === 1 ? "zi" : "zile"}`
    : `${days} ${days === 1 ? "zi rămasă" : "zile rămase"}`;
  return (
    <AccentCard tone={a.expired ? "error" : "warning"}>
      <CardTitle icon={CalendarClock}>{a.organizationName}</CardTitle>
      <p className="text-[13px] text-muted-foreground">
        {a.termLabel} · {a.expired ? "a expirat" : "expiră"} pe {formatDate(a.expiresAt)} ·{" "}
        <span className={cn("font-semibold", a.expired ? "text-destructive" : "text-gold-dark")}>{when}</span>
      </p>
      <p className="text-[13px] text-muted-foreground">
        {formatNumber(a.activeProperties)} proprietăți active · ultima autentificare: {a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "niciodată"}
      </p>
      <Actions><Link className={actionCls} to="/superadmin/agencies/$id" params={{ id: a.organizationId }}>Deschide agenția</Link></Actions>
    </AccentCard>
  );
}

function AccentCard({ tone, children }: { tone: "warning" | "error"; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5 rounded-[14px] border border-l-4 border-border bg-surface p-4", tone === "error" ? "border-l-destructive" : "border-l-gold")}>
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[15px] font-bold">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">{children}</div>;
}

const actionCls = "text-sm font-semibold text-gold-dark hover:underline";
