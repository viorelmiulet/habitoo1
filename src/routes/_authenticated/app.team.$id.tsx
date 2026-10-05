import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { getTeamOverview } from "@/lib/agency-team.functions";
import { appHead } from "@/components/app/app-head";
import { ShellLoading } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { UserAvatar } from "@/components/app/UserAvatar";
import { AgentPortfolioList, type AgentPortfolioProperty } from "@/components/app/AgentPortfolioList";
import { TeamMemberActions, teamQueryKey } from "@/components/app/team/TeamMemberActions";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { roleLabels } from "@/lib/labels";
import { normalizeRoMobile } from "@/lib/user-profile";

export const Route = createFileRoute("/_authenticated/app/team/$id")({
  head: () => appHead("Habitoo CRM — profil agent"),
  component: AgentDetailPage,
});

function AgentDetailPage() {
  const { id } = Route.useParams();
  const { data: user } = useCurrentUser();
  const fetchOverview = useServerFn(getTeamOverview);
  const isAdmin = user?.isAdmin ?? false;
  const orgId = user?.organization?.id;

  const team = useQuery({ queryKey: teamQueryKey, queryFn: () => fetchOverview(), enabled: isAdmin });

  const props = useQuery({
    queryKey: ["agency", "team", id, "properties", orgId],
    enabled: isAdmin && Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,title,reference,status,price,currency,rooms,surface,city,district,transaction_kind")
        .eq("organization_id", orgId as string)
        .eq("assigned_to", id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map(
        (p): AgentPortfolioProperty => ({
          id: p.id,
          title: p.title,
          reference: p.reference,
          status: p.status,
          price: p.price,
          currency: p.currency,
          rooms: p.rooms,
          surface: p.surface,
          city: p.city,
          district: p.district,
          transactionKind: p.transaction_kind,
        }),
      );
    },
  });

  if (!isAdmin) {
    return (
      <div className="panel p-6 text-sm text-muted-foreground">
        Doar administratorul agenției poate vedea profilul agenților.
      </div>
    );
  }
  if (team.isLoading) return <ShellLoading label="Se încarcă profilul…" />;

  const members = team.data?.members ?? [];
  const member = members.find((m) => m.id === id);

  if (!member) {
    return (
      <div className="panel space-y-3 p-6 text-sm">
        <p>Agentul nu a fost găsit în agenția ta.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/app/team">Înapoi la agenți</Link>
        </Button>
      </div>
    );
  }

  const list = props.data ?? [];
  const active = list.filter((p) => ["active", "reserved", "negotiation"].includes(p.status));
  const closed = list.filter((p) => ["sold", "rented"].includes(p.status));
  const noPhone = normalizeRoMobile(member.phone) === null;

  return (
    <div className="space-y-6">
      <Link
        to="/app/team"
        className="inline-flex h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Agenți
      </Link>

      <section className="panel flex flex-col gap-5 p-5 md:flex-row md:items-center">
        <UserAvatar name={member.full_name} path={member.avatar_url} className="size-20 text-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h1 className="truncate text-2xl font-semibold">{member.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              {member.job_title || member.roles.map((r) => roleLabels[r] ?? r).join(" · ")} · în echipă din{" "}
              {formatDate(member.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {member.roles.map((r) => (
              <StatusBadge key={r} tone="primary">
                {roleLabels[r] ?? r}
              </StatusBadge>
            ))}
            <StatusBadge tone={member.is_active ? "success" : "neutral"} dot>
              {member.is_active ? "Activ" : "Inactiv"}
            </StatusBadge>
            {member.invited ? <StatusBadge tone="warning">Invitație trimisă</StatusBadge> : null}
            {noPhone ? <StatusBadge tone="warning">Fără telefon — nu poate publica</StatusBadge> : null}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {member.email ? (
              <a href={`mailto:${member.email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-primary">
                <Mail className="size-4 shrink-0" />
                <span className="truncate">{member.email}</span>
              </a>
            ) : null}
            {member.phone ? (
              <a href={`tel:${member.phone}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                <Phone className="size-4" /> {member.phone}
              </a>
            ) : null}
          </div>
        </div>
        <TeamMemberActions member={member} members={members} currentUserId={user?.userId} variant="buttons" />
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Anunțuri în lucru" value={props.isLoading ? null : active.length} />
        <Stat label="Vândute / închiriate" value={props.isLoading ? null : closed.length} />
        <Stat label="Total portofoliu" value={props.isLoading ? null : list.length} />
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Portofoliu</h2>
        </div>
        {props.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Se încarcă proprietățile…</p>
        ) : props.error ? (
          <p className="p-5 text-sm text-destructive">{(props.error as Error).message}</p>
        ) : list.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Agentul nu are proprietăți atribuite.</p>
        ) : (
          <AgentPortfolioList
            groups={[{ id: member.id, name: "Toate proprietățile", isActive: true, properties: list }]}
          />
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value ?? "—"}</p>
    </div>
  );
}
