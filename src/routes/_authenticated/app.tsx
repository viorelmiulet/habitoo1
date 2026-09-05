import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { agencyNav, superadminNav } from "@/components/app/AppSidebar";
import { useCurrentUser } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Se încarcă spațiul de lucru…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (!user.organization && !user.isSuperadmin) return <Navigate to="/onboarding" />;

  const groups = user.isSuperadmin ? [...agencyNav, ...superadminNav] : agencyNav;

  return (
    <AppShell user={user} groups={groups}>
      <Outlet />
    </AppShell>
  );
}
