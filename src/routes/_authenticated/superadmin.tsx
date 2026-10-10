import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
import { Messenger } from "@/components/app/chat/Messenger";
import { messengerVisible } from "@/lib/chat/chat-rules";
import { superadminNav } from "@/components/app/AppSidebar";
import { ShellLoading } from "@/components/app/LoadingState";
import { appHead } from "@/components/app/app-head";
import { useCurrentUser } from "@/hooks/use-session";
import { canAccessSuperadmin } from "@/lib/superadmin-status";

export const Route = createFileRoute("/_authenticated/superadmin")({
  head: () => appHead("Habitoo CRM — administrare platformă"),
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const { data: user, isLoading } = useCurrentUser();
  usePresenceHeartbeat(Boolean(user) && !user?.impersonation);

  if (isLoading) return <ShellLoading label="Se încarcă panoul platformei…" />;
  if (!user) return <Navigate to="/login" />;
  if (!canAccessSuperadmin(user)) return <Navigate to="/app" />;

  return (
    <AppShell user={user} groups={superadminNav} variant="platform">
      <Outlet />
      {messengerVisible({ isSuperadmin: user.isSuperadmin, hasOrganization: Boolean(user.organization), impersonating: Boolean(user.impersonation) }) ? <Messenger user={user} /> : null}
    </AppShell>
  );
}
