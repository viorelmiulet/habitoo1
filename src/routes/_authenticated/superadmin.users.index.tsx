import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRightLeft, ChevronRight, Search, Users, X } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { roleLabels } from "@/lib/labels";
import { listPlatformUsers } from "@/lib/superadmin-users.functions";
import { userStatusBadge } from "@/lib/superadmin-status";
import { ReassignUserDataSheet } from "@/components/superadmin/UserAdminActions";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/superadmin/users/")({
  head: () => appHead("Habitoo CRM — utilizatori"),
  component: UsersPage,
});

function UsersPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchUsers = useServerFn(listPlatformUsers);
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [reassignOpen, setReassignOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "users"],
    queryFn: () => fetchUsers(),
  });

  const users = data?.users ?? [];
  const orgs = data?.organizations ?? [];

  const rows = useMemo(
    () =>
      users.filter((u) => {
        const text = `${u.full_name} ${u.email ?? ""}`.toLowerCase();
        if (q.trim() && !text.includes(q.trim().toLowerCase())) return false;
        if (orgFilter !== "all") {
          if (orgFilter === "none" ? u.organization_id !== null : u.organization_id !== orgFilter)
            return false;
        }
        if (roleFilter !== "all" && !u.roles.includes(roleFilter)) return false;
        if (statusFilter === "active" && !u.is_active) return false;
        if (statusFilter === "inactive" && u.is_active) return false;
        return true;
      }),
    [users, q, orgFilter, roleFilter, statusFilter],
  );

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <PageHeader
        title="Utilizatori"
        description="Toate conturile platformei. Deschide un cont pentru editare, acces temporar, realocare sau ștergere."
        actions={
          <Button
            variant="outline"
            className="h-11"
            onClick={() => setReassignOpen(true)}
          >
            <ArrowRightLeft className="mr-2 size-4" />
            Realocă date
          </Button>
        }
      />

      <div className="grid gap-3 rounded-[20px] border border-border/70 bg-card p-4 shadow-sm md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută nume sau email…"
            className="h-11 pl-9" aria-label="Caută utilizator"
          />
        </div>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Agenție" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate agențiile</SelectItem>
            <SelectItem value="none">Fără agenție</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate rolurile</SelectItem>
              <SelectItem value="agency_admin">Admin agenție</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="superadmin">Superadmin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Dezactivate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filtrele active, ca pastile care se pot închide */}
      {q.trim() || orgFilter !== "all" || roleFilter !== "all" || statusFilter !== "all" ? (
        <div className="flex flex-wrap items-center gap-2">
          {q.trim() ? <FilterPill label={`Căutare: ${q.trim()}`} onClear={() => setQ("")} /> : null}
          {orgFilter !== "all" ? (
            <FilterPill
              label={
                orgFilter === "none"
                  ? "Fără agenție"
                  : (orgs.find((o) => o.id === orgFilter)?.name ?? "Agenție")
              }
              onClear={() => setOrgFilter("all")}
            />
          ) : null}
          {roleFilter !== "all" ? (
            <FilterPill
              label={roleLabels[roleFilter] ?? roleFilter}
              onClear={() => setRoleFilter("all")}
            />
          ) : null}
          {statusFilter !== "all" ? (
            <FilterPill
              label={statusFilter === "active" ? "Active" : "Dezactivate"}
              onClear={() => setStatusFilter("all")}
            />
          ) : null}
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => {
              setQ("");
              setOrgFilter("all");
              setRoleFilter("all");
              setStatusFilter("all");
            }}
          >
            Șterge filtrele
          </button>
        </div>
      ) : null}

      <ul className="space-y-2" data-user-list>
        {isLoading ? <ListSkeleton rows={8} /> : rows.length === 0 ? (
          <li className="rounded-[20px] border border-border/70 bg-card"><EmptyState icon={Users} title="Niciun utilizator găsit" /></li>
        ) : rows.map((u) => {
          const st = userStatusBadge(u.is_active);
          return (
            <li key={u.id}>
              <Link to="/superadmin/users/$id" params={{ id: u.id }} className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-gold/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1fr)_auto_auto_minmax(0,0.8fr)_auto]">
                <UserAvatar name={u.full_name} path={u.avatar_url} className="size-11 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{u.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{u.email ?? "—"}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1 md:hidden">
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    <span className="truncate text-xs text-muted-foreground">{u.roles.map((r) => roleLabels[r] ?? r).join(", ")} · {u.organization_name ?? "Fără agenție"}</span>
                  </span>
                </span>
                <span className="hidden truncate text-sm text-muted-foreground md:block">{u.organization_name ?? "Fără agenție"}</span>
                <span className="hidden flex-wrap gap-1 md:flex">{u.roles.map((r) => <StatusBadge key={r} tone="primary">{roleLabels[r] ?? r}</StatusBadge>)}</span>
                <span className="hidden md:block"><StatusBadge tone={st.tone}>{st.label}</StatusBadge></span>
                <span className="hidden text-xs text-muted-foreground md:block">{u.last_sign_in_at ? `Autentificat ${formatDate(u.last_sign_in_at)}` : "Nicio autentificare"}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>

      <ReassignUserDataSheet users={users} open={reassignOpen} onOpenChange={setReassignOpen} />
    </div>
  );
}

/** Pastilă de filtru activ, cu închidere — același tipar ca la Proprietăți. */
function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Elimină filtrul ${label}`}
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}
