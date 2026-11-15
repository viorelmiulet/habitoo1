/**
 * Ecranul principal al aplicației: dashboard randat condiționat după rol.
 * - `agent` → „ziua mea” (ce trebuie făcut acum)
 * - `agency_admin` → „unde pierdem” (blocajele agenției)
 * Superadminul fără agenție intră direct în panoul platformei.
 */
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ShellLoading } from "@/components/app/LoadingState";
import { useCurrentUser } from "@/hooks/use-session";
import { AgentDashboard } from "@/components/app/dashboard/AgentDashboard";
import { ManagerDashboard } from "@/components/app/dashboard/ManagerDashboard";
import { HomeDashboard } from "@/components/app/dashboard/HomeDashboard";
import { appHead } from "@/components/app/app-head";
import { dashboardHomeFor } from "@/lib/superadmin-status";
import { DailyBriefCard } from "@/components/app/dashboard/DailyBriefCard";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => {
    const head = appHead("Azi și agenda ta — Habitoo CRM");
    const description = "Rezumatul zilnic Habitoo CRM: activități, lead-uri, potriviri și proprietăți care au nevoie de atenție.";
    return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: "Azi și agenda ta — Habitoo CRM" }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading || !user) return <ShellLoading label="Se încarcă dashboardul…" />;

  // Superadminul care nu impersonează nicio agenție nu are ce căuta pe dashboardul
  // agenției: intră direct în panoul platformei, fără ecran intermediar.
  if (dashboardHomeFor(user) === "/superadmin") return <Navigate to="/superadmin" replace />;

  const firstName = (user.profile?.full_name || user.email || "").trim().split(/\s+/)[0] || "coleg";

  return (
    <div className="space-y-8">
      {user.organization?.id ? <DailyBriefCard userId={user.userId} organizationId={user.organization.id} /> : null}
      <HomeDashboard organizationId={user.organization?.id} firstName={firstName} />
      <div data-tour="dashboard-work" className="space-y-6">
        {user.role === "agent" ? <AgentDashboard /> : <ManagerDashboard />}
      </div>
    </div>
  );
}
