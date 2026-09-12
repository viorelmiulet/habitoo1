import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar, type NavGroup, type ShellVariant } from "@/components/app/AppSidebar";
import { Topbar } from "@/components/app/Topbar";
import { MobileNav } from "@/components/app/MobileNav";
import { useUnreadNotificationsCount } from "@/components/app/NotificationsMenu";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { countUnresolvedSupportTickets } from "@/lib/support.functions";
import { ImpersonationBanner } from "@/components/app/ImpersonationBanner";
import { ActiveAccessBanner } from "@/components/app/AccountAccessCard";
import { SubscriptionBanner } from "@/components/app/SubscriptionBanner";

import { useApplyTheme } from "@/hooks/use-theme";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-state";
import { roleLabels } from "@/lib/labels";


import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/hooks/use-session";
import { clearAuthenticatedSession } from "@/lib/sign-out";

/**
 * Shell-ul zonei autentificate: sidebar colapsabil (desktop), drawer + bară
 * inferioară (mobil), topbar compact, banner DEMO. `variant="platform"`
 * oferă o identitate vizuală distinctă pentru Superadmin.
 */
export function AppShell({
  user,
  groups,
  variant = "agency",
  children,
}: {
  user: CurrentUser;
  groups: NavGroup[];
  variant?: ShellVariant;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useApplyTheme();

  const isPlatform = variant === "platform";
  const orgName = isPlatform
    ? "Habitoo CRM"
    : (user.organization?.name ?? (user.isSuperadmin ? "Administrare platformă" : "Agenția mea"));
  const isDemo = !isPlatform && user.organization?.is_demo === true;
  const roleLabel = roleLabels[user.role];

  const unread = useUnreadNotificationsCount(user.userId);
  const countTickets = useServerFn(countUnresolvedSupportTickets);
  const supportOpen = useQuery({
    queryKey: ["support-unresolved"],
    enabled: user.isSuperadmin,
    queryFn: () => countTickets({}),
    refetchInterval: 60_000,
  });
  const badges: Partial<Record<string, number>> = {};
  if (unread.data) badges["/app/notifications"] = unread.data;
  if (supportOpen.data) badges["/superadmin/support"] = supportOpen.data;

  const signOut = async () => {
    await clearAuthenticatedSession(queryClient);
    await navigate({ to: "/login", replace: true });
  };

  const sidebarProps = {
    groups,
    organizationName: orgName,
    roleLabel,
    isDemo,
    variant,
    user,
    onSignOut: signOut,
    badges,
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-background">
        <a
          href="#continut"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          Sari la conținut
        </a>

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border transition-[width] duration-200 lg:block",
            collapsed ? "w-[72px]" : "w-64",
          )}
        >
          <AppSidebar {...sidebarProps} collapsed={collapsed} onToggleCollapse={toggle} />
        </aside>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent
            side="left"
            className="w-[min(85vw,300px)] p-0"
            aria-describedby={undefined}
          >
            <SheetTitle className="sr-only">Meniu de navigare</SheetTitle>
            <AppSidebar {...sidebarProps} onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>

        <div
          className={cn(
            "transition-[padding] duration-200",
            collapsed ? "lg:pl-[72px]" : "lg:pl-64",
          )}
        >
          <Topbar
            user={user}
            onOpenMenu={() => setMenuOpen(true)}
            onSignOut={signOut}
            isDemo={isDemo}
            variant={variant}
          />
          <ImpersonationBanner user={user} />
          <SubscriptionBanner user={user} />
          <ActiveAccessBanner enabled={!user.impersonation} />

          {isDemo ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 border-b border-warning/40 bg-warning/15 px-4 py-1.5 text-center text-xs font-medium text-warning-foreground"
            >
              <FlaskConical className="size-3.5 shrink-0" />
              <span>
                Lucrezi în agenția <strong>DEMO / QA</strong> – toate datele sunt fictive și pot fi
                resetate oricând de un superadmin.
              </span>
            </div>
          ) : null}
          <main
            id="continut"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pt-5 pb-24 outline-none sm:px-6 lg:px-8 lg:pt-6 lg:pb-10"
          >
            {children}
          </main>
        </div>

        <MobileNav variant={variant} onOpenMenu={() => setMenuOpen(true)} />
      </div>
    </TooltipProvider>
  );
}
