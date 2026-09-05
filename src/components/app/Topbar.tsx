import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, FlaskConical, HelpCircle, LogOut, Menu, Settings, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlobalSearch } from "@/components/app/GlobalSearch";
import { QuickAdd } from "@/components/app/QuickAdd";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/format";
import { roleLabels } from "@/lib/labels";
import type { CurrentUser } from "@/hooks/use-session";

export function Topbar({
  user,
  onOpenMenu,
  isDemo = false,
}: {
  user: CurrentUser;
  onOpenMenu: () => void;
  isDemo?: boolean;
}) {
  const navigate = useNavigate();

  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications-unread", user.userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.userId)
        .is("read_at", null);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu}>
        <Menu className="size-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1.5">
        {isDemo ? (
          <span
            data-testid="demo-badge"
            className="mr-1 hidden items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-warning-foreground uppercase sm:inline-flex"
            title="Agenție de test – datele sunt fictive"
          >
            <FlaskConical className="size-3.5" /> Demo / QA
          </span>
        ) : null}
        <QuickAdd />

        <Button variant="ghost" size="icon" asChild className="relative">
          <Link to="/app/notifications">
            <Bell className="size-5" />
            {unread > 0 ? (
              <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Link>
        </Button>

        <Button variant="ghost" size="icon" className="hidden sm:inline-flex" asChild>
          <a href="https://docs.lovable.dev" target="_blank" rel="noreferrer" aria-label="Ajutor">
            <HelpCircle className="size-5" />
          </a>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-3 pl-1 text-sm transition-colors hover:border-primary/40">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials(user.profile?.full_name || user.email)}
              </span>
              <span className="hidden max-w-32 truncate md:inline">
                {user.profile?.full_name || user.email}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="space-y-0.5">
              <p className="truncate text-sm">{user.profile?.full_name || "Utilizator"}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {roleLabels[user.role]} · {user.organization?.name ?? "—"}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/app/settings">
                <UserRound className="size-4" /> Profil și agenție
              </Link>
            </DropdownMenuItem>
            {user.isAdmin ? (
              <DropdownMenuItem asChild>
                <Link to="/app/settings">
                  <Settings className="size-4" /> Utilizatori și roluri
                </Link>
              </DropdownMenuItem>
            ) : null}
            {user.isSuperadmin ? (
              <DropdownMenuItem asChild>
                <Link to="/superadmin">
                  <ShieldCheck className="size-4" /> Panou superadmin
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut className="size-4" /> Deconectare
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
