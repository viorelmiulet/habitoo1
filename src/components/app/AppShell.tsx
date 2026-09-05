import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AppSidebar } from "@/components/app/AppSidebar";
import { Topbar } from "@/components/app/Topbar";
import { roleLabels } from "@/lib/labels";
import type { CurrentUser } from "@/hooks/use-session";
import type { ComponentProps } from "react";

type Groups = ComponentProps<typeof AppSidebar>["groups"];

export function AppShell({
  user,
  groups,
  children,
}: {
  user: CurrentUser;
  groups: Groups;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const orgName = user.isSuperadmin ? "Administrare platformă" : (user.organization?.name ?? "Agenția mea");
  const isDemo = !user.isSuperadmin && user.organization?.is_demo === true;

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-sidebar-border lg:block">
        <AppSidebar groups={groups} organizationName={orgName} roleLabel={roleLabels[user.role]} isDemo={isDemo} />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <AppSidebar
            groups={groups}
            organizationName={orgName}
            roleLabel={roleLabels[user.role]}
            isDemo={isDemo}
            onNavigate={() => setMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <Topbar user={user} onOpenMenu={() => setMenuOpen(true)} isDemo={isDemo} />
        {isDemo ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-b border-warning/40 bg-warning/15 px-4 py-1.5 text-center text-xs font-medium text-warning-foreground"
          >
            <FlaskConical className="size-3.5 shrink-0" />
            <span>
              Lucrezi în agenția <strong>DEMO / QA</strong> – toate datele sunt fictive și pot fi resetate oricând de un
              superadmin.
            </span>
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
