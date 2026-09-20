import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Bell,
  Building2,
  CalendarDays,
  BarChart3,
  ChartBar,
  FileSignature,
  Flame,
  FlaskConical,
  Gauge,
  Handshake,
  Layers,
  LifeBuoy,
  Mail,
  Megaphone,
  Workflow,
  MapPin,
  ListChecks,
  ChevronDown,
  HelpCircle,
  LogOut,
  Monitor,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Radar,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Users,
  PlugZap,
  Database,
  Bot,
  BrainCircuit,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { UserAvatar } from "@/components/app/UserAvatar";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import type { CurrentUser } from "@/hooks/use-session";
import { useTheme, type ThemePreference } from "@/hooks/use-theme";
import { planAgentLimitLabel, planLabel } from "@/lib/plans";
import {
  activeNavigationPath,
  itemIsActive,
  sidebarOpenStateKey,
} from "@/components/app/sidebar-navigation";

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
      { label: "Contracte", to: "/app/contracts", icon: FileSignature },
    ],
  },
  {
    title: "Rețea",
    items: [{ label: "Colaborare", to: "/app/collaboration", icon: Handshake }],
  },
  {
    title: "Prospectare",
    items: [{ label: "Oportunități", to: "/app/prospecting", icon: Radar }],
  },
  {
    title: "Asistent AI",
    items: [
      { label: "Habitoo Manager", to: "/app/ai-manager", icon: Workflow },
      { label: "AI CRM", to: "/app/ai-crm", icon: BrainCircuit },
      { label: "AI Marketing", to: "/app/ai-marketing", icon: Megaphone },
      { label: "Habitoo AI", to: "/app/ai", icon: Bot },
      { label: "Studio AI", to: "/app/ai-media", icon: Wand2 },
    ],
  },
  {
    title: "ACP",
    items: [
      { label: "Analiză nouă", to: "/app/acp/new", icon: Sparkles },
      { label: "Analize salvate", to: "/app/acp", icon: BarChart3, exact: true },
      { label: "Date piață", to: "/app/acp/date-piata", icon: Database },
    ],
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
      { label: "Stare agenții", to: "/superadmin/stare-agentii", icon: ChartBar },
      { label: "Utilizatori", to: "/superadmin/users", icon: Users },
      { label: "Portaluri", to: "/superadmin/portals", icon: PlugZap },
      { label: "Email", to: "/superadmin/mail", icon: Mail },
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

function AccountMenu({
  user,
  roleLabel,
  variant,
  collapsed,
  onSignOut,
}: {
  user: CurrentUser;
  roleLabel: string;
  variant: ShellVariant;
  collapsed: boolean;
  onSignOut?: () => void;
}) {
  const { preference, setPreference } = useTheme();
  const displayName = user.profile?.full_name || user.email || "Utilizator";
  const isPlatform = variant === "platform";

  return (
    <DropdownMenu>
      <CollapsedTip collapsed={collapsed} label={`${displayName} · ${roleLabel}`}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "h-11 w-full justify-start gap-3 border-0 px-2.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "mx-auto size-11 justify-center px-0",
            )}
            aria-label="Meniu utilizator"
          >
            <UserAvatar
              name={displayName}
              path={user.profile?.avatar_url}
              className="size-8 bg-sidebar-primary/20 text-sidebar-accent-foreground ring-1 ring-sidebar-primary/40 ring-inset"
            />
            {collapsed ? null : (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[15px] font-semibold text-sidebar-accent-foreground">
                    {displayName}
                  </span>
                  <span className="block truncate text-[11px] font-normal text-sidebar-foreground/60">
                    {roleLabel}
                  </span>
                </span>
                <ChevronDown className="size-4 text-sidebar-foreground/60" aria-hidden />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
      </CollapsedTip>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align="start" className="w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate text-sm">{displayName}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">
            {roleLabel} · {user.organization?.name ?? "—"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/settings">
            <UserRound /> Profil și agenție
          </Link>
        </DropdownMenuItem>
        {user.isAdmin ? (
          <DropdownMenuItem asChild>
            <Link to="/app/settings">
              <Settings /> Utilizatori și roluri
            </Link>
          </DropdownMenuItem>
        ) : null}
        {user.isSuperadmin ? (
          <DropdownMenuItem asChild>
            <Link to={isPlatform ? "/app" : "/superadmin"}>
              <ShieldCheck /> {isPlatform ? "Înapoi la CRM" : "Panou platformă"}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <a href="https://docs.lovable.dev" target="_blank" rel="noreferrer">
            <HelpCircle /> Ajutor
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Temă
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as ThemePreference)}
        >
          <DropdownMenuRadioItem value="light">
            <Sun /> Luminoasă
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Întunecată
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> Sistem
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut /> Deconectare
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  variant?: ShellVariant;
  user?: CurrentUser;
  onSignOut?: () => void;
  badges?: Partial<Record<string, number>>;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isPlatform = variant === "platform";
  const homeTo: LinkProps["to"] = isPlatform ? "/superadmin" : "/app";
  const activePath = activeNavigationPath(pathname, groups);
  const expandableGroups = useMemo(
    () => groups.filter((group) => group.title && group.items.length > 1),
    [groups],
  );
  const activeGroupTitles = useMemo(
    () =>
      expandableGroups
        .filter((group) => group.items.some((item) => item.to === activePath))
        .map((group) => group.title ?? ""),
    [activePath, expandableGroups],
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    let stored: string[] = [];
    try {
      const raw = window.localStorage.getItem(sidebarOpenStateKey(user?.userId));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      stored = Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      stored = [];
    }
    setOpenGroups(new Set([...stored, ...activeGroupTitles]));
  }, [activeGroupTitles, user?.userId]);

  const toggleGroup = (title: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        window.localStorage.setItem(sidebarOpenStateKey(user?.userId), JSON.stringify([...next]));
      } catch {
        // Stocarea poate fi indisponibilă; meniul rămâne funcțional în sesiunea curentă.
      }
      return next;
    });
  };

  const renderItem = (item: NavItem, child = false) => {
    const badge = badges?.[String(item.to)];
    const active = item.to === activePath;
    return (
      <li key={String(item.to)}>
        <CollapsedTip collapsed={collapsed} label={item.label}>
          <Link
            to={item.to}
            data-tour={`nav:${String(item.to)}`}
            data-nav-row
            activeOptions={{ exact: item.exact }}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "group relative flex min-h-11 items-center gap-3 rounded-control px-2.5 text-[15px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
              collapsed && "mx-auto size-11 justify-center px-0",
              child && !collapsed && "pl-10",
              active &&
                "bg-sidebar-primary/20 font-bold text-surface hover:bg-sidebar-primary/25 hover:text-surface",
            )}
          >
            <item.icon className={cn(active && "text-sidebar-primary")} aria-hidden />
            {collapsed ? null : <span className="truncate">{item.label}</span>}
            {badge ? (
              <span
                className={cn(
                  "ml-auto flex h-5 min-w-5 items-center justify-center rounded-pill bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground",
                  collapsed && "absolute top-0 right-0",
                )}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </Link>
        </CollapsedTip>
      </li>
    );
  };

  return (
    <div
      data-collapsed={collapsed ? "true" : "false"}
      className="flex h-full flex-col bg-sidebar text-sidebar-foreground"
    >
      <div
        className={cn(
          "px-3 pt-4 pb-3",
          collapsed ? "flex justify-center" : "px-4",
          onNavigate && !collapsed && "pr-12",
        )}
      >
        <Link
          to={homeTo}
          onClick={onNavigate}
          aria-label="Habitoo CRM — acasă"
          className={cn(
            "flex rounded-control bg-surface transition-colors hover:bg-surface/90 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
            collapsed ? "size-11 items-center justify-center" : "min-h-14 items-center gap-3 px-3",
          )}
        >
          <BrandLogo
            markOnly={collapsed}
            className={cn(collapsed ? "size-8 shrink-0" : "h-7 w-auto max-w-24 shrink-0")}
            priority
          />
          {collapsed ? null : (
            <span className="min-w-0 leading-tight">
              <span className="block font-display text-base font-semibold text-foreground">
                Habitoo CRM
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-foreground">
                {organizationName}
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav
        aria-label="Navigare principală"
        className="scrollbar-hidden flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3"
      >
        {collapsed ? null : (
          <p className="px-2.5 pt-1 pb-2 text-[10px] font-semibold tracking-[0.14em] text-sidebar-foreground/45 uppercase">
            Meniu
          </p>
        )}
        {groups.map((group, index) => {
          const title = group.title;
          const expandable = Boolean(title && group.items.length > 1);
          const open = title ? openGroups.has(title) : true;
          const active = group.items.some((item) => item.to === activePath);
          const GroupIcon = group.items[0]?.icon;

          if (expandable && title && !collapsed && GroupIcon) {
            const contentId = `sidebar-group-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <div key={title} className="mb-1">
                <Button
                  type="button"
                  variant="ghost"
                  data-nav-row
                  className={cn(
                    "min-h-11 w-full justify-start gap-3 border-0 px-2.5 text-[15px] font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]",
                    active && "text-surface",
                  )}
                  aria-expanded={open}
                  aria-controls={contentId}
                  onClick={() => toggleGroup(title)}
                >
                  <GroupIcon className={cn(active && "text-sidebar-primary")} aria-hidden />
                  <span className="truncate">{title}</span>
                  <ChevronDown
                    className={cn(
                      "ml-auto transition-transform duration-200",
                      open && "rotate-180",
                    )}
                    aria-hidden
                  />
                </Button>
                <ul id={contentId} hidden={!open} className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => renderItem(item, true))}
                </ul>
              </div>
            );
          }

          return (
            <div key={title ?? index} className="mb-2">
              {title && !collapsed ? (
                <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-[0.14em] text-sidebar-foreground/45 uppercase">
                  {title}
                </p>
              ) : title && collapsed ? (
                <div className="mx-2 my-2 h-px bg-sidebar-border" aria-hidden />
              ) : null}
              <ul className="space-y-0.5">{group.items.map((item) => renderItem(item))}</ul>
            </div>
          );
        })}

        {isPlatform ? (
          <div className="mt-2 border-t border-sidebar-border pt-2">
            <ul>{renderItem({ label: "Înapoi la CRM", to: "/app", icon: ArrowLeftRight })}</ul>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        {user && !collapsed && !isPlatform ? (
          <div className="mb-1 rounded-control border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-sidebar-foreground/45 uppercase">
              Plan curent
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-sidebar-accent-foreground">
              {planLabel(user.organization?.plan)} · {planAgentLimitLabel(user.organization?.plan)}
            </p>
          </div>
        ) : null}

        {user ? (
          <AccountMenu
            user={user}
            roleLabel={roleLabel}
            variant={variant}
            collapsed={collapsed}
            onSignOut={onSignOut}
          />
        ) : null}

        {onToggleCollapse ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Extinde meniul" : "Restrânge meniul"}
            aria-pressed={collapsed}
            className={cn(
              "mt-1 hidden min-h-11 items-center justify-start gap-3 border-0 px-2.5 text-xs text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:flex [&_svg]:size-5 [&_svg]:stroke-[1.75]",
              collapsed ? "mx-auto size-11 justify-center px-0" : "w-full",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden />
            ) : (
              <>
                <PanelLeftClose aria-hidden />
                <span>Restrânge meniul</span>
              </>
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
