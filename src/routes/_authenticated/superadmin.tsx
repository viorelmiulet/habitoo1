import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { superadminNav } from "@/components/app/AppSidebar";
import { ShellLoading } from "@/components/app/LoadingState";
import { appHead } from "@/components/app/app-head";
import { useCurrentUser } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/superadmin")({
  head: () => appHead("Habitoo CRM — administrare platformă"),
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) return <ShellLoading label="Se încarcă panoul platformei…" />;
  if (!user) return <Navigate to="/login" />;
  if (!user.isSuperadmin) return <Navigate to="/app" />;

  return (
    <AppShell user={user} groups={superadminNav} variant="platform">
      <Outlet />
    </AppShell>
  );
}
