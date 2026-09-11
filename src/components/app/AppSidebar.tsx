import { Link, type LinkProps } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Bell,
  Building2,
  CalendarDays,
  ChartBar,
  Flame,
  FlaskConical,
  Gauge,
  Handshake,

  Layers,
  LifeBuoy,
  MapPin,
  ListChecks,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Users,
  PlugZap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { UserAvatar } from "@/components/app/UserAvatar";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CurrentUser } from "@/hooks/use-session";

export type NavItem = { label: string; to: LinkProps["to"]; icon: typeof Gauge; exact?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };
export type ShellVariant = "agency" | "platform";

export const agencyNav: NavGroup[] = [
  { items: [{ label: "Dashboard", to: "/app", icon: Gauge, exact: true }] },
  {
    title: "Portofoliu",
    items: [
      { label: "Proprietăți", to: "/app/properties", icon: Building2 },
      { label: "Adaugă proprietate", to: "/app/properties/new", icon: PlusCircle },
    ],
  },
  {
    title: "Clienți",
    items: [
      { label: "Contacte", to: "/app/contacts", icon: UserRound },
      { label: "Cereri", to: "/app/requests", icon: Target },
      { label: "Lead-uri", to: "/app/leads", icon: Flame },
    ],
  },
  {
    title: "Rețea",
    items: [{ label: "Colaborare", to: "/app/collaboration", icon: Handshake }],
  },

  {
    title: "Productivitate",
    items: [
      { label: "Activități", to: "/app/activities", icon: ListChecks },
      { label: "Calendar", to: "/app/calendar", icon: CalendarDays },
      { label: "Matching", to: "/app/matching", icon: Sparkles },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Rapoarte", to: "/app/reports", icon: ChartBar },
      { label: "Obiective", to: "/app/goals", icon: Layers },
      { label: "Notificări", to: "/app/notifications", icon: Bell },
      { label: "Tichetele mele", to: "/app/support", icon: LifeBuoy },
      { label: "Agenți", to: "/app/team", icon: Users },
      { label: "Setări agenție", to: "/app/settings", icon: Settings },
    ],
  },
];

/**
 * Navigația vizibilă unui agent simplu: zonele de administrare a agenției
 * (Agenți, Setări agenție) sunt ascunse complet, nu doar dezactivate.
 * Agentul păstrează accesul la propriul profil.
 */
export const agentNav: NavGroup[] = agencyNav.map((group) =>
  group.title === "Management"
    ? {
        ...group,
        items: [
          ...group.items.filter((i) => i.to !== "/app/team" && i.to !== "/app/settings"),
          { label: "Profilul meu", to: "/app/settings", icon: UserRound },
        ],
      }
    : group,
);

/** Navigația agenției, filtrată în funcție de rol. */
export function agencyNavFor(isAdmin: boolean): NavGroup[] {
  return isAdmin ? agencyNav : agentNav;
}

export const superadminNav: NavGroup[] = [
  { items: [{ label: "Dashboard global", to: "/superadmin", icon: Gauge, exact: true }] },
  {
    title: "Platformă",
    items: [
      { label: "Agenții", to: "/superadmin/agencies", icon: Building2 },
      { label: "Utilizatori", to: "/superadmin/users", icon: Users },
      { label: "Portaluri", to: "/superadmin/portals", icon: PlugZap },
      { label: "Suport", to: "/superadmin/support", icon: LifeBuoy },
      { label: "Nomenclator SIRUTA", to: "/superadmin/nomenclator", icon: MapPin },
      { label: "QA / Demo Data", to: "/superadmin/qa", icon: FlaskConical },
    ],
  },
  {
    title: "Audit",
    items: [{ label: "Jurnal audit", to: "/superadmin/audit", icon: ShieldCheck }],
  },
];

/** Etichetă (path → label) pentru breadcrumbs, derivată din navigație. */
export const navLabelByPath: Record<string, string> = Object.fromEntries(
  [...agencyNav, ...superadminNav].flatMap((g) => g.items.map((i) => [String(i.to), i.label])),
);

function CollapsedTip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactElement;
}) {
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar({
  groups,
  organizationName,
  roleLabel,
  isDemo = false,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  variant = "agency",
  user,
  onSignOut,
  badges,
}: {
  groups: NavGroup[];
  organizationName: string;
  roleLabel: string;
  isDemo?: boolean;
  onNavigate?: () => void;
  /** Doar desktop: meniu restrâns la iconițe. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  variant?: ShellVariant;
  user?: CurrentUser;
  onSignOut?: () => void;
  /** Contoare afișate lângă itemi (cheie = ruta). */
  badges?: Partial<Record<string, number>>;
}) {
  const isPlatform = variant === "platform";
  const homeTo: LinkProps["to"] = isPlatform ? "/superadmin" : "/app";
  const displayName = user?.profile?.full_name || user?.email || "Utilizator";

  return (
    <div
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground",
        isPlatform && "bg-[oklch(0.2_0.03_248)]",
      )}
    >
      {/* Brand */}
      {/* Fundal alb fix (nu depinde de temă): logo-ul are text navy și trebuie să rămână lizibil în dark mode.
          `pr-12` pe drawer-ul mobil lasă loc butonului de închidere al Sheet-ului. */}
      <div
        className={cn(
          "flex items-center px-3 pt-4 pb-3",
          collapsed ? "justify-center" : "px-4",
          onNavigate && !collapsed && "pr-12",
        )}
      >
        <Link
          to={homeTo}
          onClick={onNavigate}
          aria-label="Habitoo CRM — acasă"
          className={cn(
            "flex items-center justify-center rounded-lg bg-white transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
            collapsed ? "size-10" : "h-11 w-full px-3",
          )}
        >
          {collapsed ? (
            <BrandLogo markOnly className="size-7" priority />
          ) : (
            <BrandLogo className="h-7 w-auto max-w-full" priority />
          )}
        </Link>
      </div>

      {/* Workspace */}
      {collapsed ? (
        <div className="mb-2 flex flex-col items-center gap-1.5 px-2">
          <CollapsedTip
            collapsed
            label={`${isPlatform ? "Platformă" : "Agenție"}: ${organizationName}${isDemo ? " (Demo / QA)" : ""}`}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg text-xs font-semibold",
                isPlatform
                  ? "bg-gold/20 text-gold ring-1 ring-gold/40 ring-inset"
                  : "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              {isPlatform ? <ShieldCheck className="size-4" /> : initials(organizationName)}
            </span>
          </CollapsedTip>
          {isDemo ? <span className="size-1.5 rounded-full bg-warning" aria-hidden /> : null}
        </div>
      ) : (
        <div
          className={cn(
            "mx-3 mb-3 rounded-xl border px-3 py-2.5",
            isPlatform ? "border-gold/30 bg-gold/10" : "border-sidebar-border bg-sidebar-accent/40",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase",
              isPlatform ? "text-gold" : "text-sidebar-foreground/50",
            )}
          >
            {isPlatform ? <ShieldCheck className="size-3" /> : null}
            {isPlatform ? "Administrare platformă" : "Agenție"}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-sidebar-accent-foreground">{organizationName}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-sidebar-foreground/65">
            <span className="truncate">{roleLabel}</span>
            {isDemo ? (
              <span className="shrink-0 rounded bg-warning/25 px-1.5 py-px text-[10px] font-semibold tracking-wide text-warning-foreground uppercase">
                Demo
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav aria-label="Navigare principală" className="flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3">
        {groups.map((group, i) => (
          <div key={group.title ?? i} className="mb-3">
            {group.title ? (
              collapsed ? (
                <div className="mx-2 my-2 h-px bg-sidebar-border" aria-hidden />
              ) : (
                <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-sidebar-foreground/45 uppercase">
                  {group.title}
                </p>
              )
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const badge = badges?.[String(item.to)];
                return (
                  <li key={String(item.to)}>
                    <CollapsedTip collapsed={collapsed} label={item.label}>
                      <Link
                        to={item.to}
                        activeOptions={{ exact: item.exact }}
                        onClick={onNavigate}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                          collapsed ? "mx-auto size-10 justify-center" : "px-3 py-2.5",
                        )}
                        activeProps={{
                          className: cn(
                            "bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                          ),
                        }}

                      >
                        <item.icon className="size-4 shrink-0" />
                        {collapsed ? null : <span className="truncate">{item.label}</span>}
                        {badge ? (
                          <span
                            className={cn(
                              "flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-destructive-foreground",
                              collapsed ? "absolute top-1 right-1" : "ml-auto",
                            )}
                          >
                            {badge > 99 ? "99+" : badge}
                          </span>
                        ) : null}
                      </Link>
                    </CollapsedTip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {isPlatform ? (
          <div className="mt-1 border-t border-sidebar-border pt-3">
            <CollapsedTip collapsed={collapsed} label="Înapoi la CRM">
              <Link
                to="/app"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                  collapsed ? "mx-auto size-10 justify-center" : "px-3 py-2",
                )}
              >
                <ArrowLeftRight className="size-4 shrink-0" />
                {collapsed ? null : <span className="truncate">Înapoi la CRM</span>}
              </Link>
            </CollapsedTip>
          </div>
        ) : null}
      </nav>

      {/* Footer: user + collapse */}
      <div className="border-t border-sidebar-border p-2">
        {user ? (
          <div className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5", collapsed && "justify-center px-0")}>
            <CollapsedTip collapsed={collapsed} label={`${displayName} · ${roleLabel}`}>
              <UserAvatar
                name={displayName}
                path={user.profile?.avatar_url}
                className="size-8 bg-sidebar-primary/20 text-sidebar-accent-foreground ring-1 ring-sidebar-primary/40 ring-inset"
              />

            </CollapsedTip>
            {collapsed ? null : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-sidebar-accent-foreground">{displayName}</p>
                  <p className="truncate text-[11px] text-sidebar-foreground/60">{user.email}</p>
                </div>
                {onSignOut ? (
                  <button
                    type="button"
                    onClick={onSignOut}
                    aria-label="Deconectare"
                    title="Deconectare"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
                  >
                    <LogOut className="size-4" />
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <p className="px-3 py-2 text-xs text-sidebar-foreground/60">{roleLabel}</p>
        )}

        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Extinde meniul" : "Restrânge meniul"}
            aria-pressed={collapsed}
            className={cn(
              "mt-1 hidden items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none lg:flex",
              collapsed ? "mx-auto size-9 justify-center px-0" : "w-full",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                <span>Restrânge meniul</span>
              </>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
