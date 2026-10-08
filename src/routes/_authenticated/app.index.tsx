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
import { DashboardOverview } from "@/components/app/dashboard/DashboardOverview";
import { appHead } from "@/components/app/app-head";
import { dashboardHomeFor } from "@/lib/superadmin-status";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => appHead("Habitoo CRM — panou principal"),
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
      <DashboardOverview organizationId={user.organization?.id} firstName={firstName} />
      {user.role === "agent" ? <AgentDashboard /> : <ManagerDashboard />}
    </div>
  );
}
