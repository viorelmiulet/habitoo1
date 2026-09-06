import { Fragment, useMemo } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  ChevronRight,
  FlaskConical,
  HelpCircle,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlobalSearch } from "@/components/app/GlobalSearch";
import { QuickAdd } from "@/components/app/QuickAdd";
import { NotificationsMenu } from "@/components/app/NotificationsMenu";
import { SupportWidget } from "@/components/app/SupportWidget";
import { navLabelByPath, type ShellVariant } from "@/components/app/AppSidebar";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useTheme, type ThemePreference } from "@/hooks/use-theme";
import { initials } from "@/lib/format";
import { UserAvatar } from "@/components/app/UserAvatar";
import { roleLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/hooks/use-session";

const segmentLabels: Record<string, string> = {
  new: "Adaugă",
  edit: "Editare",
  settings: "Setări",
  notifications: "Notificări",
};

function useBreadcrumbs(pathname: string) {
  return useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const crumbs: { to: string; label: string }[] = [];
    let acc = "";
    for (const part of parts) {
      acc += `/${part}`;
      const label =
        navLabelByPath[acc] ??
        segmentLabels[part] ??
        (/^[0-9a-f-]{20,}$/i.test(part) || /^\d+$/.test(part) ? "Detalii" : decodeURIComponent(part));
      crumbs.push({ to: acc, label });
    }
    return crumbs;
  }, [pathname]);
}

export function Topbar({
  user,
  onOpenMenu,
  onSignOut,
  isDemo = false,
  variant = "agency",
}: {
  user: CurrentUser;
  onOpenMenu: () => void;
  onSignOut: () => void;
  isDemo?: boolean;
  variant?: ShellVariant;
}) {
  const { pathname } = useLocation();
  const crumbs = useBreadcrumbs(pathname);
  const { preference, setPreference } = useTheme();
  const isPlatform = variant === "platform";
  const displayName = user.profile?.full_name || user.email;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur-md sm:px-4 lg:px-6",
        isPlatform && "shadow-[inset_0_2px_0_0_var(--color-gold)]",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label="Deschide meniul de navigare"
      >
        <Menu className="size-5" />
      </Button>

      <Link
        to={isPlatform ? "/superadmin" : "/app"}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-xs ring-1 ring-border lg:hidden"
        aria-label="Habitoo CRM — acasă"
      >
        <BrandLogo markOnly className="size-7" priority />
      </Link>

      {/* Breadcrumbs (desktop) */}
      <nav aria-label="Poziție în aplicație" className="hidden min-w-0 flex-1 items-center lg:flex">
        <ol className="flex min-w-0 items-center gap-1 text-sm">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={c.to}>
                {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden /> : null}
                <li className="min-w-0">
                  {last ? (
                    <span aria-current="page" className="block truncate font-medium text-foreground">
                      {c.label}
                    </span>
                  ) : (
                    <Link
                      to={c.to}
                      className="block truncate text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {c.label}
                    </Link>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>

      {/* Search (tablet+) */}
      <div className="hidden min-w-0 flex-1 md:block lg:max-w-sm lg:flex-none xl:max-w-md">
        <GlobalSearch />
      </div>

      <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
        <div className="md:hidden">
          <GlobalSearch compact />
        </div>

        {isDemo ? (
          <span
            data-testid="demo-badge"
            className="mr-1 hidden items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-warning-foreground uppercase sm:inline-flex"
            title="Agenție de test – datele sunt fictive"
          >
            <FlaskConical className="size-3.5" /> Demo / QA
          </span>
        ) : null}

        {isPlatform ? (
          <span className="mr-1 hidden items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-gold uppercase sm:inline-flex">
            <ShieldCheck className="size-3.5" /> Platformă
          </span>
        ) : (
          <QuickAdd />
        )}

        {isPlatform ? null : <SupportWidget />}

        <NotificationsMenu userId={user.userId} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Meniu utilizator"
              className="ml-0.5 flex h-9 items-center gap-2 rounded-full border border-border bg-surface py-1 pr-1 pl-1 text-sm transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:pr-3"
            >
              <UserAvatar
                name={displayName}
                path={user.profile?.avatar_url}
                className="size-7 bg-primary/10 text-primary"
              />

              <span className="hidden max-w-32 truncate md:inline">{displayName}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="space-y-0.5">
              <p className="truncate text-sm">{user.profile?.full_name || "Utilizator"}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
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
                <Link to={isPlatform ? "/app" : "/superadmin"}>
                  <ShieldCheck className="size-4" /> {isPlatform ? "Înapoi la CRM" : "Panou platformă"}
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <a href="https://docs.lovable.dev" target="_blank" rel="noreferrer">
                <HelpCircle className="size-4" /> Ajutor
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Temă</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={preference} onValueChange={(v) => setPreference(v as ThemePreference)}>
              <DropdownMenuRadioItem value="light">
                <Sun className="mr-2 size-4" /> Luminoasă
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="mr-2 size-4" /> Întunecată
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="mr-2 size-4" /> Sistem
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOut className="size-4" /> Deconectare
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
