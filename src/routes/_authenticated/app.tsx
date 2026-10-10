import { useCallback } from "react";
import { createFileRoute, Navigate, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearAuthenticatedSession } from "@/lib/sign-out";
import { SessionRecoveryScreen, useSessionRecovery } from "@/components/app/SessionRecovery";
import { PortalBulkWatcher } from "@/components/app/PortalBulkProgress";
import { AppShell } from "@/components/app/AppShell";
import { agencyNavFor, superadminNav } from "@/components/app/AppSidebar";
import { filterAiNavigation } from "@/components/app/sidebar-navigation";
import { ShellLoading } from "@/components/app/LoadingState";
import { OrgBlocked } from "@/components/app/OrgBlocked";
import { appHead } from "@/components/app/app-head";
import { useCurrentUser } from "@/hooks/use-session";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { CompleteAgencyData } from "@/components/app/CompleteAgencyData";
import { mustCompleteAgencyData } from "@/lib/agency-public-data";
import { CompleteUserProfile } from "@/components/app/CompleteUserProfile";
import { mustCompleteUserProfile } from "@/lib/user-profile";
import { CompanyAnafSync } from "@/components/app/CompanyAnafSync";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
import { Messenger } from "@/components/app/chat/Messenger";
import { messengerVisible } from "@/lib/chat/chat-rules";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => appHead("Habitoo CRM — aplicație"),
  component: AppLayout,
});

function AppLayout() {
  const { data: user, isLoading, isError, refetch } = useCurrentUser();
  const { features } = useAiFeatures();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const onExpired = useCallback(() => {
    const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    void clearAuthenticatedSession(queryClient)
      .catch(() => undefined)
      .then(() => navigate({ to: "/login", search: { redirect }, replace: true }));
  }, [queryClient, navigate]);

  const recovery = useSessionRecovery({
    data: user,
    isLoading,
    isError,
    refetch,
    startAutoRefresh: () => supabase.auth.startAutoRefresh(),
    onExpired,
  });

  if (recovery.showError && !user) {
    return <SessionRecoveryScreen onRetry={() => void recovery.retry()} retrying={recovery.retrying} />;
  }
  if (isLoading) return <ShellLoading label="Se încarcă spațiul de lucru…" />;
  if (!user) return <Navigate to="/login" />;
  const blocked = user.isSuperadmin ? null : user.orgBlocked;
  if (blocked) return <OrgBlocked reason={blocked} />;
  if (!user.organization && !user.isSuperadmin) return <Navigate to="/onboarding" />;
  if (
    mustCompleteAgencyData({
      roles: user.roles,
      impersonating: Boolean(user.impersonation),
      org: user.organization,
    })
  ) {
    return <CompleteAgencyData user={user} />;
  }
  if (
    mustCompleteUserProfile({
      roles: user.roles,
      impersonating: Boolean(user.impersonation),
      profile: user.profile,
    })
  ) {
    return <CompleteUserProfile user={user} />;
  }

  // Funcțiile AI sunt activate individual per agenție; cele oprite nu apar în meniu.
  const agencyGroups = filterAiNavigation(agencyNavFor(user.isAdmin), features);
  const groups = user.isSuperadmin ? [...agencyGroups, ...superadminNav] : agencyGroups;

  return (
    <AppShell user={user} groups={groups} variant="agency">
      <Outlet />
      <PortalBulkWatcher />
      {messengerVisible({ isSuperadmin: user.isSuperadmin, hasOrganization: Boolean(user.organization), impersonating: Boolean(user.impersonation) }) ? <Messenger user={user} /> : null}
      {user.role === "agency_admin" && !user.impersonation ? <CompanyAnafSync org={user.organization} /> : null}
    </AppShell>
  );
}
