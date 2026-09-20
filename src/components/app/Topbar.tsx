import { Link } from "@tanstack/react-router";
import type { RefObject } from "react";
import { Compass, FlaskConical, Menu, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/app/GlobalSearch";
import { QuickAdd } from "@/components/app/QuickAdd";
import { NotificationsMenu } from "@/components/app/NotificationsMenu";
import { SupportWidget } from "@/components/app/SupportWidget";
import { type ShellVariant } from "@/components/app/AppSidebar";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOnboardingTour } from "@/components/app/OnboardingTour";
import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/hooks/use-session";

export function Topbar({
  user,
  onOpenMenu,
  menuTriggerRef,
  isDemo = false,
  variant = "agency",
}: {
  user: CurrentUser;
  onOpenMenu: () => void;
  menuTriggerRef?: RefObject<HTMLButtonElement | null>;
  isDemo?: boolean;
  variant?: ShellVariant;
}) {
  const tour = useOnboardingTour();
  const isPlatform = variant === "platform";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-4 lg:px-6",
        isPlatform && "shadow-[inset_0_2px_0_0_var(--color-gold)]",
      )}
    >
      <Button
        ref={menuTriggerRef}
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
      </div>
    </header>
  );
}
