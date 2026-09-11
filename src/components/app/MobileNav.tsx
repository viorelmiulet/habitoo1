import { Link, type LinkProps } from "@tanstack/react-router";
import { Building2, CalendarDays, Flame, Gauge, Menu, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShellVariant } from "@/components/app/AppSidebar";

type Item = { label: string; to: LinkProps["to"]; icon: typeof Gauge; exact?: boolean };

const agencyItems: Item[] = [
  { label: "Acasă", to: "/app", icon: Gauge, exact: true },
  { label: "Proprietăți", to: "/app/properties", icon: Building2 },
  { label: "Lead-uri", to: "/app/leads", icon: Flame },
  { label: "Calendar", to: "/app/calendar", icon: CalendarDays },
];

const platformItems: Item[] = [
  { label: "Acasă", to: "/superadmin", icon: Gauge, exact: true },
  { label: "Agenții", to: "/superadmin/agencies", icon: Building2 },
  { label: "Utilizatori", to: "/superadmin/users", icon: Users },
  { label: "Audit", to: "/superadmin/audit", icon: ShieldCheck },
];

/** Bară de navigare fixă pe mobil (sub 1024px) cu cele mai folosite secțiuni. */
export function MobileNav({
  variant = "agency",
  onOpenMenu,
}: {
  variant?: ShellVariant;
  onOpenMenu: () => void;
}) {
  const items = variant === "platform" ? platformItems : agencyItems;
  return (
    <nav
      aria-label="Navigare rapidă"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={String(item.to)}>
            <Link
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <item.icon className="size-5" />
              <span className="leading-none">{item.label}</span>
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onOpenMenu}
            className={cn(
              "flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
            )}
            aria-label="Deschide meniul complet"
          >
            <Menu className="size-5" />
            <span className="leading-none">Meniu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
