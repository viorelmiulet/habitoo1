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
  Settings,
  ShieldCheck,
  Trash2,
  Sparkles,
  Target,
  UserRound,
  Users,
  PlugZap,
  ScrollText,
  Database,
  Bot,
  BrainCircuit,
  Wand2,
  Newspaper,
  Music2,
  Coins,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { UserAvatar } from "@/components/app/UserAvatar";
import sidebarLogo from "@/assets/habitoo-sidebar-light.png.asset.json";
import sidebarMark from "@/assets/habitoo-mark-light.png.asset.json";
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
import { planLabel } from "@/lib/plans";
import {
  activeNavigationPath,
  itemIsActive,
  sidebarOpenStateKey,
} from "@/components/app/sidebar-navigation";

export type NavItem = { label: string; to: LinkProps["to"]; icon: typeof Gauge; exact?: boolean };
export type NavGroup = { title?: string; section?: string; collapsible?: boolean; items: NavItem[] };
export type ShellVariant = "agency" | "platform";

export const agencyNav: NavGroup[] = [
  { items: [{ label: "Acasă", to: "/app", icon: Gauge, exact: true }] },
  { title: "Proprietăți", collapsible: true, items: [
    { label: "Toate proprietățile", to: "/app/properties", icon: Building2 },
    { label: "Adaugă proprietate", to: "/app/properties/new", icon: PlusCircle },
    { label: "Clipurile mele", to: "/app/clipurile-mele", icon: Film },
  ] },
  { items: [{ label: "Lead-uri", to: "/app/leads", icon: Flame }] },
  { title: "Clienți", collapsible: true, items: [
    { label: "Contacte", to: "/app/contacts", icon: UserRound },
    { label: "Cereri", to: "/app/requests", icon: Target },
    { label: "Contracte", to: "/app/contracts", icon: FileSignature },
  ] },
  { title: "Calendar", collapsible: true, items: [
    { label: "Calendar", to: "/app/calendar", icon: CalendarDays },
    { label: "Activități", to: "/app/activities", icon: ListChecks },
  ] },
  { items: [{ label: "Matching", to: "/app/matching", icon: Sparkles }] },
  { section: "Creștere", items: [{ label: "Colaborare", to: "/app/collaboration", icon: Handshake }] },
  { items: [{ label: "Anunțuri particulari", to: "/app/anunturi-particulari", icon: Newspaper }] },
  { title: "ACP", collapsible: true, items: [
    { label: "Analiză nouă", to: "/app/acp/new", icon: Sparkles },
    { label: "Analize salvate", to: "/app/acp", icon: BarChart3, exact: true },
  ] },
  { title: "Asistent AI", collapsible: true, items: [
    { label: "Habitoo Manager", to: "/app/ai-manager", icon: Workflow },
    { label: "AI CRM", to: "/app/ai-crm", icon: BrainCircuit },
    { label: "AI Marketing", to: "/app/ai-marketing", icon: Megaphone },
    { label: "Habitoo AI", to: "/app/ai", icon: Bot },
    { label: "Studio AI", to: "/app/ai-media", icon: Wand2 },
  ] },
  { section: "Agenție", items: [{ label: "Comisioane", to: "/app/comisioane", icon: Coins }] },
  { title: "Rapoarte", collapsible: true, items: [
    { label: "Rapoarte", to: "/app/reports", icon: ChartBar },
    { label: "Obiective", to: "/app/goals", icon: Layers },
  ] },
  { title: "Setări", collapsible: true, items: [
    { label: "Setări agenție", to: "/app/settings", icon: Settings },
    { label: "Agenți", to: "/app/team", icon: Users },
    { label: "Notificări", to: "/app/notifications", icon: Bell },
    { label: "Tichetele mele", to: "/app/support", icon: LifeBuoy },
    { label: "Alege abonamentul", to: "/abonament", icon: CalendarDays },
  ] },
];

/** Agents retain their profile, but not agency administration or billing. */
export const agentNav: NavGroup[] = agencyNav.map((group) =>
  group.title === "Setări"
    ? { ...group, items: [
        { label: "Profilul meu", to: "/app/settings", icon: UserRound },
        ...group.items.filter((i) => i.to !== "/app/team" && i.to !== "/app/settings" && i.to !== "/abonament"),
      ] }
    : group,
);

/** Navigația agenției, filtrată în funcție de rol. */
export function agencyNavFor(isAdmin: boolean): NavGroup[] {
  return isAdmin ? agencyNav : agentNav;
}

/**
 * „Date piață” este zona de administrare a datelor de piață: apare în meniu
 * doar pentru SuperAdmin. Ceilalți utilizatori nu o văd, iar pagina însăși îi
 * trimite înapoi la ACP (SuperadminGate).
 */
export const marketDataNavItem: NavItem = {
  label: "Date piață",
  to: "/app/acp/date-piata",
  icon: Database,
};

export function withMarketDataNav(groups: NavGroup[], isSuperadmin: boolean): NavGroup[] {
  if (!isSuperadmin) return groups;
  return groups.map((group) =>
    group.title === "ACP" ? { ...group, items: [...group.items, marketDataNavItem] } : group,
  );
}

export const superadminNav: NavGroup[] = [
  { items: [{ label: "Dashboard global", to: "/superadmin", icon: Gauge, exact: true }] },
  {
    title: "Platformă",
    items: [
      { label: "Agenții", to: "/superadmin/agencies", icon: Building2 },
      { label: "Stare agenții", to: "/superadmin/stare-agentii", icon: ChartBar },
      { label: "Cereri abonament", to: "/superadmin/cereri-abonament", icon: CalendarDays },
      { label: "Utilizatori", to: "/superadmin/users", icon: Users },
      { label: "Portaluri", to: "/superadmin/portals", icon: PlugZap },
      { label: "Setări portaluri", to: "/superadmin/setari-portaluri", icon: PlugZap },
      { label: "Jurnal portaluri", to: "/superadmin/portal-logs", icon: ScrollText },
      { label: "Funcții AI", to: "/superadmin/ai-features", icon: Bot },
      { label: "Email", to: "/superadmin/mail", icon: Mail },
      { label: "Blog", to: "/superadmin/blog", icon: Newspaper },
      { label: "Muzică video", to: "/superadmin/muzica", icon: Music2 },
      { label: "Suport", to: "/superadmin/support", icon: LifeBuoy },
      { label: "Nomenclator localități", to: "/superadmin/nomenclator", icon: MapPin },
      { label: "QA / Demo Data", to: "/superadmin/qa", icon: FlaskConical },
    ],
  },
  {
    title: "Audit",
    items: [
      { label: "Jurnal audit", to: "/superadmin/audit", icon: ShieldCheck },
      { label: "Elemente șterse", to: "/superadmin/deleted", icon: Trash2 },
    ],
  },
];

/** Etichetă (path → label) pentru breadcrumbs, derivată din navigație. */
export const navLabelByPath: Record<string, string> = Object.fromEntries(
  [...agencyNav, ...superadminNav]
    .flatMap((g) => g.items)
    .concat(marketDataNavItem)
    .map((i) => [String(i.to), i.label]),
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
                    {roleLabel}{isPlatform ? "" : ` · Plan ${planLabel(user.organization?.plan)}`}
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
    () => groups.filter((group) => group.title && (group.collapsible || group.items.length > 1)),
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
    setOpenGroups(new Set([...stored.map((title) => title === "Portofoliu" ? "Proprietăți" : title), ...activeGroupTitles]));
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

  const renderItem = (item: NavItem, child = false, groupTitle?: string) => {
    const badge = badges?.[String(item.to)];
    const active = item.to === activePath || Boolean(groupTitle && groups.find((group) => group.title === groupTitle)?.items.some((entry) => entry.to === activePath));
    return (
      <li key={String(item.to)}>
        <CollapsedTip collapsed={collapsed} label={item.label}>
          <Link
            to={item.to}
            data-tour={groupTitle ? `group:${groupTitle === "Proprietăți" ? "Portofoliu" : groupTitle}` : `nav:${String(item.to)}`}
            data-nav-targets={groupTitle ? `nav:${String(item.to)}` : undefined}
            data-nav-row
            aria-label={collapsed ? item.label : undefined}
            activeOptions={{ exact: item.exact }}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "group relative flex min-h-11 items-center gap-3 rounded-control px-2.5 text-[15px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
              collapsed && "mx-auto size-11 justify-center px-0",
              child && !collapsed && "pl-10",
              active &&
                "bg-sidebar-accent font-bold text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className={cn(active && "text-sidebar-primary")} aria-hidden />
            {collapsed ? null : <span className="truncate">{item.label}</span>}
            {badge ? (
              <span
                className={cn(
                  "ml-auto flex h-5 min-w-5 items-center justify-center rounded-pill bg-gold px-1 text-[10px] font-semibold text-gold-foreground",
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
            "flex items-center justify-center rounded-control focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
            collapsed ? "size-11" : "min-h-14 w-full",
          )}
        >
          <img src={collapsed ? sidebarMark.url : sidebarLogo.url} alt="Habitoo CRM"
            className={cn("object-contain", collapsed ? "size-10" : "h-auto w-40 max-w-full")}
            loading="eager" decoding="async" />
        </Link>
        {collapsed ? null : <p className="mt-2 truncate text-center text-xs font-medium text-sidebar-foreground">{organizationName}</p>}
      </div>

      <nav
        data-tour="main-navigation"
        aria-label="Navigare principală"
        className="scrollbar-hidden flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3"
      >
        {groups.map((group, index) => {
          const title = group.title;
          const expandable = Boolean(title && (group.collapsible || group.items.length > 1));
          const open = title ? openGroups.has(title) : true;
          const active = group.items.some((item) => item.to === activePath);
          const GroupIcon = group.items[0]?.icon;

          if (expandable && title && collapsed && GroupIcon) {
            const badge = badges?.[String(group.items[0]?.to)];
            return (
              <div key={title} className="mb-1">
                {group.section ? <div className="mx-2 my-2 h-px bg-sidebar-border" aria-hidden /> : null}
                <DropdownMenu>
                  <CollapsedTip collapsed label={title}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={title}
                        data-tour={`group:${title === "Proprietăți" ? "Portofoliu" : title}`}
                        data-nav-targets={group.items.map((item) => `nav:${String(item.to)}`).join(" ")}
                        data-nav-row
                        className={cn(
                          "relative mx-auto flex size-11 justify-center border-0 px-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]",
                          active && "bg-sidebar-accent font-bold text-sidebar-accent-foreground",
                        )}
                      >
                        <GroupIcon className={cn(active && "text-sidebar-primary")} aria-hidden />
                        {badge ? <span className="absolute top-0 right-0 flex h-5 min-w-5 items-center justify-center rounded-pill bg-gold px-1 text-[10px] font-semibold text-gold-foreground">{badge > 99 ? "99+" : badge}</span> : null}
                      </Button>
                    </DropdownMenuTrigger>
                  </CollapsedTip>
                  <DropdownMenuContent side="right" align="start" sideOffset={10} className="w-60">
                    <DropdownMenuLabel>{title}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {group.items.map((item) => {
                      const itemActive = item.to === activePath;
                      const itemBadge = badges?.[String(item.to)];
                      return (
                        <DropdownMenuItem key={String(item.to)} asChild>
                          <Link
                            to={item.to}
                            activeOptions={{ exact: item.exact }}
                            aria-current={itemActive ? "page" : undefined}
                            onClick={onNavigate}
                            className={cn(itemActive && "bg-accent font-semibold text-accent-foreground")}
                          >
                            <item.icon aria-hidden />
                            <span>{item.label}</span>
                            {itemBadge ? <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-pill bg-gold px-1 text-[10px] font-semibold text-gold-foreground">{itemBadge > 99 ? "99+" : itemBadge}</span> : null}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          }

          if (expandable && title && !collapsed && GroupIcon) {
            const contentId = `sidebar-group-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <div key={title} className="mb-1">
                {group.section ? <p className="px-2.5 pt-4 pb-1 text-[10px] font-semibold text-navy-muted uppercase">{group.section}</p> : null}
                <Button
                  type="button"
                  data-tour={`group:${title === "Proprietăți" ? "Portofoliu" : title}`}
                  data-nav-targets={group.items.map((item) => `nav:${String(item.to)}`).join(" ")}
                  variant="ghost"
                  data-nav-row
                  className={cn(
                    "min-h-11 w-full justify-start gap-3 border-0 px-2.5 text-[15px] font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground",
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
            <div key={title ?? index} className="mb-1">
              {group.section ? (collapsed ? <div className="mx-2 my-2 h-px bg-sidebar-border" aria-hidden /> : <p className="px-2.5 pt-4 pb-1 text-[10px] font-semibold text-navy-muted uppercase">{group.section}</p>) : null}
              {title && !collapsed && !expandable ? (
                <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-[0.14em] text-navy-muted uppercase">
                  {title}
                </p>
              ) : title && collapsed && !expandable ? (
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
