/**
 * Ecranul principal al aplicației: dashboard randat condiționat după rol.
 * - `agent` → „ziua mea” (ce trebuie făcut acum)
 * - `agency_admin` → „unde pierdem” (blocajele agenției)
 * Superadminul are dashboardul lui dedicat în zona Superadmin.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { ShellLoading } from "@/components/app/LoadingState";
import { SectionCard } from "@/components/app/SectionCard";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-session";
import { AgentDashboard } from "@/components/app/dashboard/AgentDashboard";
import { ManagerDashboard } from "@/components/app/dashboard/ManagerDashboard";
import { DashboardOverview } from "@/components/app/dashboard/DashboardOverview";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => appHead("Habitoo CRM — panou principal"),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading || !user) return <ShellLoading label="Se încarcă dashboardul…" />;

  if (user.role === "superadmin" && !user.organization) {
    return (
      <>
        <PageHeader
          title="Habitoo CRM"
          description="Contul tău este de tip superadmin și nu este atașat unei agenții."
        />
        <SectionCard title="Zona Superadmin" icon={ShieldCheck}>
          <p className="text-sm text-muted-foreground">
            Coada de lucru, sănătatea integrărilor și creșterea platformei sunt în dashboardul
            Superadmin.
          </p>
          <Button className="mt-3" size="sm" asChild>
            <Link to="/superadmin">Deschide Superadmin</Link>
          </Button>
        </SectionCard>
      </>
    );
  }

  const firstName = (user.profile?.full_name || user.email || "").trim().split(/\s+/)[0] || "coleg";

  return (
    <div className="space-y-8">
      <DashboardOverview organizationId={user.organization?.id} firstName={firstName} />
      {user.role === "agent" ? <AgentDashboard /> : <ManagerDashboard />}
    </div>
  );
}
