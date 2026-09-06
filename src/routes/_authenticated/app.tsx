import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { agencyNav, superadminNav } from "@/components/app/AppSidebar";
import { ShellLoading } from "@/components/app/LoadingState";
import { OrgBlocked } from "@/components/app/OrgBlocked";
import { appHead } from "@/components/app/app-head";
import { useCurrentUser } from "@/hooks/use-session";
import { orgBlockReason } from "@/lib/org-access";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => appHead("Habitoo CRM — aplicație"),
  component: AppLayout,
});

function AppLayout() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) return <ShellLoading label="Se încarcă spațiul de lucru…" />;
  if (!user) return <Navigate to="/login" />;
  if (!user.organization && !user.isSuperadmin) return <Navigate to="/onboarding" />;

  const blocked = user.isSuperadmin ? null : orgBlockReason(user.organization);
  if (blocked) return <OrgBlocked reason={blocked} />;


  const groups = user.isSuperadmin ? [...agencyNav, ...superadminNav] : agencyNav;

  return (
    <AppShell user={user} groups={groups} variant="agency">
      <Outlet />
    </AppShell>
  );
}
