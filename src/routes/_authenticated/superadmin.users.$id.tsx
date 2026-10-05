import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { appHead } from "@/components/app/app-head";
import { ListSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { UserAvatar } from "@/components/app/UserAvatar";
import { UserAdminActions } from "@/components/superadmin/UserAdminActions";
import { BackLink, DetailCard, DetailNotFound, DetailRow } from "@/components/superadmin/SuperadminUi";
import { listPlatformUsers, type PlatformUser } from "@/lib/superadmin-users.functions";
import { formatDate, formatDateTime } from "@/lib/format";
import { roleLabels } from "@/lib/labels";
import { userStatusBadge } from "@/lib/superadmin-status";

export const Route = createFileRoute("/_authenticated/superadmin/users/$id")({
  head: () => appHead("Habitoo CRM — detaliu utilizator"),
  component: UserDetailPage,
});

function UserDetailPage() {
  const { id } = Route.useParams();
  const fetchUsers = useServerFn(listPlatformUsers);
  const { data, isLoading } = useQuery({ queryKey: ["superadmin", "users"], queryFn: () => fetchUsers() });
  if (isLoading) return <ListSkeleton rows={6} />;
  const user = data?.users.find((u) => u.id === id);
  if (!user) return <DetailNotFound title="Utilizatorul nu a fost găsit" to="/superadmin/users" label="Înapoi la utilizatori" />;
  return <UserDetail user={user} users={data?.users ?? []} organizations={data?.organizations ?? []} />;
}

export function UserDetail({ user, users, organizations }: { user: PlatformUser; users: PlatformUser[]; organizations: { id: string; name: string }[] }) {
  const st = userStatusBadge(user.is_active);
  const props = useQuery({
    queryKey: ["superadmin", "user", user.id, "properties"],
    queryFn: async () => {
      const { count } = await supabase.from("properties").select("id", { count: "exact", head: true }).eq("assigned_to", user.id).is("deleted_at", null);
      return count ?? 0;
    },
  });
  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <BackLink to="/superadmin/users" label="Înapoi la utilizatori" />
      <header className="flex flex-col gap-4 rounded-[22px] border border-border/70 bg-card p-5 shadow-sm sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar name={user.full_name} path={user.avatar_url} className="size-16 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold text-foreground">{user.full_name}</h1>
            <p className="truncate text-sm text-muted-foreground">{user.email ?? "—"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
              {user.roles.map((r) => <StatusBadge key={r} tone="primary">{roleLabels[r] ?? r}</StatusBadge>)}
              {user.organization_id ? (
                <Link to="/superadmin/agencies/$id" params={{ id: user.organization_id }} className="text-sm font-medium text-gold-dark underline-offset-4 hover:underline">{user.organization_name}</Link>
              ) : null}
            </div>
          </div>
        </div>
        <UserAdminActions user={user} users={users} organizations={organizations} />
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <DetailCard title="Profil">
          <dl className="divide-y divide-border">
            <DetailRow label="Nume">{user.full_name}</DetailRow>
            <DetailRow label="Email">{user.email}</DetailRow>
            <DetailRow label="Telefon">{user.phone}</DetailRow>
            <DetailRow label="Funcție">{user.job_title}</DetailRow>
          </dl>
        </DetailCard>
        <DetailCard title="Agenție și rol">
          <dl className="divide-y divide-border">
            <DetailRow label="Agenție">{user.organization_id ? <Link to="/superadmin/agencies/$id" params={{ id: user.organization_id }} className="font-medium text-gold-dark hover:underline">{user.organization_name}</Link> : "Fără agenție"}</DetailRow>
            <DetailRow label="Rol">{user.roles.map((r) => roleLabels[r] ?? r).join(", ") || null}</DetailRow>
          </dl>
        </DetailCard>
        <DetailCard title="Proprietăți">
          <p className="text-3xl font-semibold tabular-nums">{props.isLoading ? "—" : props.data}</p>
          <p className="text-sm text-muted-foreground">proprietăți asignate</p>
        </DetailCard>
        <DetailCard title="Securitate">
          <dl className="divide-y divide-border">
            <DetailRow label="Ultima autentificare">{user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "Niciodată"}</DetailRow>
            <DetailRow label="Stare cont">{st.label}</DetailRow>
            <DetailRow label="Cont creat">{formatDate(user.created_at)}</DetailRow>
          </dl>
        </DetailCard>
      </div>
    </div>
  );
}
