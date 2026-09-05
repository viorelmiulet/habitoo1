import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { superadminNav } from "@/components/app/AppSidebar";
import { useCurrentUser } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/superadmin")({
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Se încarcă…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (!user.isSuperadmin) return <Navigate to="/app" />;

  return (
    <AppShell user={user} groups={superadminNav}>
      <Outlet />
    </AppShell>
  );
}
