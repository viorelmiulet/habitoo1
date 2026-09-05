import { Link, type LinkProps } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  CalendarDays,
  ChartBar,
  Flame,
  FlaskConical,
  Gauge,
  Layers,
  ListChecks,
  PlusCircle,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { label: string; to: LinkProps["to"]; icon: typeof Gauge; exact?: boolean };
type NavGroup = { title?: string; items: NavItem[] };

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
      { label: "Setări agenție", to: "/app/settings", icon: Settings },
    ],
  },
];

export const superadminNav: NavGroup[] = [
  { items: [{ label: "Dashboard global", to: "/superadmin", icon: Gauge, exact: true }] },
  {
    title: "Platformă",
    items: [
      { label: "Agenții", to: "/superadmin/agencies", icon: Building2 },
      { label: "Utilizatori", to: "/superadmin/users", icon: Users },
      { label: "Audit", to: "/superadmin/audit", icon: ShieldCheck },
      { label: "QA / Demo Data", to: "/superadmin/qa", icon: FlaskConical },
    ],
  },
];

export function AppSidebar({
  groups,
  organizationName,
  roleLabel,
  isDemo = false,
  onNavigate,
}: {
  groups: NavGroup[];
  organizationName: string;
  roleLabel: string;
  isDemo?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Habitoo</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-sidebar-foreground/60">
            <span className="truncate">{organizationName}</span>
            {isDemo ? (
              <span className="shrink-0 rounded bg-warning/25 px-1.5 py-px text-[10px] font-semibold tracking-wide text-warning-foreground uppercase">
                Demo
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {groups.map((group, i) => (
          <div key={group.title ?? i}>
            {group.title ? (
              <p className="px-3 pb-2 text-[10px] font-semibold tracking-widest text-sidebar-foreground/45 uppercase">
                {group.title}
              </p>
            ) : null}
            <div className="space-y-1">
              {group.items.map((item) => (
                <Link
                  key={String(item.to)}
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  onClick={onNavigate}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  activeProps={{
                    className: cn("bg-sidebar-accent text-sidebar-accent-foreground"),
                  }}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-5 py-4 text-xs text-sidebar-foreground/60">
        {roleLabel}
      </div>
    </div>
  );
}
