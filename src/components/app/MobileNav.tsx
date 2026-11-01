import { Link, type LinkProps } from "@tanstack/react-router";
import { Building2, Flame, Gauge, Menu, ShieldCheck, Users } from "lucide-react";
import type { ShellVariant } from "@/components/app/AppSidebar";
import { QuickAdd } from "@/components/app/QuickAdd";

type Item = { label: string; to: LinkProps["to"]; icon: typeof Gauge; exact?: boolean };

const agencyLeft: Item[] = [
  { label: "Acasă", to: "/app", icon: Gauge, exact: true },
  { label: "Proprietăți", to: "/app/properties", icon: Building2 },
];
const agencyRight: Item[] = [{ label: "Lead-uri", to: "/app/leads", icon: Flame }];

const platformItems: Item[] = [
  { label: "Acasă", to: "/superadmin", icon: Gauge, exact: true },
  { label: "Agenții", to: "/superadmin/agencies", icon: Building2 },
  { label: "Utilizatori", to: "/superadmin/users", icon: Users },
  { label: "Audit", to: "/superadmin/audit", icon: ShieldCheck },
];

const itemClass =
  "group flex h-16 min-w-12 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground";

function NavItem({ item }: { item: Item }) {
  return (
    <li>
      <Link
        to={item.to}
        activeOptions={{ exact: item.exact }}
        className={itemClass}
        activeProps={{ className: "!text-foreground font-bold [&>svg]:text-gold", "aria-current": "page" }}
      >
        <item.icon className="size-[22px]" />
        <span className="max-w-full truncate leading-none">{item.label}</span>
      </Link>
    </li>
  );
}

/** Bară de navigare fixă pe mobil (sub 1024px) cu cele mai folosite secțiuni. */
export function MobileNav({
  variant = "agency",
  onOpenMenu,
}: {
  variant?: ShellVariant;
  onOpenMenu: () => void;
}) {
  const isPlatform = variant === "platform";
  return (
    <nav
      aria-label="Navigare rapidă"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {isPlatform ? (
          platformItems.map((item) => <NavItem key={String(item.to)} item={item} />)
        ) : (
          <>
            {agencyLeft.map((item) => (
              <NavItem key={String(item.to)} item={item} />
            ))}
            <li className="flex h-16 items-start justify-center" data-mobile-quick-add>
              <QuickAdd variant="mobile-nav" />
            </li>
            {agencyRight.map((item) => (
              <NavItem key={String(item.to)} item={item} />
            ))}
          </>
        )}
        <li>
          <button
            type="button"
            onClick={onOpenMenu}
            className={`${itemClass} w-full`}
            aria-label="Deschide meniul complet"
          >
            <Menu className="size-[22px]" />
            <span className="leading-none">Meniu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
