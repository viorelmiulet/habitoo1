import { Link } from "@tanstack/react-router";
import {
  Compass,
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
  ChevronDown,
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
import { type ShellVariant } from "@/components/app/AppSidebar";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useTheme, type ThemePreference } from "@/hooks/use-theme";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOnboardingTour } from "@/components/app/OnboardingTour";
import { roleLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/hooks/use-session";

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
  const { preference, setPreference } = useTheme();
  const tour = useOnboardingTour();
  const isPlatform = variant === "platform";
  const displayName = user.profile?.full_name || user.email;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-4 lg:px-6",
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
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-border lg:hidden"
        aria-label="Habitoo CRM — acasă"
      >
        <BrandLogo markOnly className="size-7" priority />
      </Link>

      {/* Căutare globală lată */}
      <div className="hidden min-w-0 flex-1 md:block md:max-w-xl">
        <GlobalSearch />
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <div className="md:hidden">
          <GlobalSearch compact />
        </div>

        {isDemo ? (
          <span
            data-testid="demo-badge"
            className="mr-1 hidden items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-1 text-[11px] font-medium tracking-wide text-warning-foreground uppercase sm:inline-flex"
            title="Agenție de test – datele sunt fictive"
          >
            <FlaskConical className="size-3.5" /> Demo / QA
          </span>
        ) : null}

        {isPlatform ? (
          <span className="mr-1 hidden items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-medium tracking-wide text-gold uppercase sm:inline-flex">
            <ShieldCheck className="size-3.5" /> Platformă
          </span>
        ) : (
          <QuickAdd />
        )}

        {tour.available ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={tour.start}
                aria-label="Pornește ghidul interactiv"
              >
                <Compass className="size-4" />
                <span className="hidden sm:inline">Ghid</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Tur ghidat al aplicației</TooltipContent>
          </Tooltip>
        ) : null}

        {isPlatform ? null : <SupportWidget />}

        <NotificationsMenu userId={user.userId} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Meniu utilizator"
              className="ml-0.5 flex h-11 items-center gap-2.5 rounded-full py-1 pr-2 pl-1 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <UserAvatar
                name={displayName}
                path={user.profile?.avatar_url}
                className="size-9 bg-primary/10 text-primary"
              />

              <span className="hidden min-w-0 flex-col items-start leading-tight md:flex">
                <span className="max-w-36 truncate font-medium">{displayName}</span>
                <span className="max-w-36 truncate text-xs text-muted-foreground">
                  {roleLabels[user.role]}
                </span>
              </span>
              <ChevronDown className="hidden size-4 shrink-0 text-muted-foreground md:block" />
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
                  <ShieldCheck className="size-4" />{" "}
                  {isPlatform ? "Înapoi la CRM" : "Panou platformă"}
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <a href="https://docs.lovable.dev" target="_blank" rel="noreferrer">
                <HelpCircle className="size-4" /> Ajutor
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Temă
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preference}
              onValueChange={(v) => setPreference(v as ThemePreference)}
            >
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
