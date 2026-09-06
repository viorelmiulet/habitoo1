import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { agencyNavFor, superadminNav } from "@/components/app/AppSidebar";
import { ShellLoading } from "@/components/app/LoadingState";
import { OrgBlocked } from "@/components/app/OrgBlocked";
import { appHead } from "@/components/app/app-head";
import { useCurrentUser } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => appHead("Habitoo CRM — aplicație"),
  component: AppLayout,
});

function AppLayout() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) return <ShellLoading label="Se încarcă spațiul de lucru…" />;
  if (!user) return <Navigate to="/login" />;
  const blocked = user.isSuperadmin ? null : user.orgBlocked;
  if (blocked) return <OrgBlocked reason={blocked} />;
  if (!user.organization && !user.isSuperadmin) return <Navigate to="/onboarding" />;


  const agencyGroups = agencyNavFor(user.isAdmin);
  const groups = user.isSuperadmin ? [...agencyGroups, ...superadminNav] : agencyGroups;

  return (
    <AppShell user={user} groups={groups} variant="agency">
      <Outlet />
    </AppShell>
  );
}
