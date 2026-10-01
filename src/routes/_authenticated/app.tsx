import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/app")({
  head: () => appHead("Habitoo CRM — aplicație"),
  component: AppLayout,
});

function AppLayout() {
  const { data: user, isLoading } = useCurrentUser();
  const { features } = useAiFeatures();

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
    </AppShell>
  );
}
