import { useState } from "react";
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

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-sidebar-border lg:block">
        <AppSidebar groups={groups} organizationName={orgName} roleLabel={roleLabels[user.role]} />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <AppSidebar
            groups={groups}
            organizationName={orgName}
            roleLabel={roleLabels[user.role]}
            onNavigate={() => setMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <Topbar user={user} onOpenMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
