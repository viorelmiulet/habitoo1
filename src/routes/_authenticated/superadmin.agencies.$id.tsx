import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appHead } from "@/components/app/app-head";
import { ListSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { UserAvatar } from "@/components/app/UserAvatar";
import { useAgencyLogoUrl } from "@/components/app/AgencyBrandingCard";
import { AgencyHeaderActions, AgencySubscriptionControls } from "@/components/superadmin/AgencyAdminActions";
import { BackLink, DetailCard, DetailNotFound, DetailRow } from "@/components/superadmin/SuperadminUi";
import { listPlatformUsers } from "@/lib/superadmin-users.functions";
import { formatDate, formatDateTime } from "@/lib/format";
import { roleLabels } from "@/lib/labels";
import { PLAN_LABELS, normalizePlan, planAgentLimit, planPriceLabel, seatLimitLabel } from "@/lib/plans";
import { subscriptionSummary, subscriptionTermLabel } from "@/lib/subscription";
import { PORTAL_CONNECTION_LABEL, portalDisplayName, portalDisplayStatus, type PortalId } from "@/lib/portals/registry";
import { initials, orgStatusBadge, userStatusBadge } from "@/lib/superadmin-status";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/superadmin/agencies/$id")({
  head: () => appHead("Habitoo CRM — detaliu agenție"),
  component: AgencyDetailPage,
});

function AgencyDetailPage() {
  const { id } = Route.useParams();
  const org = useQuery({
    queryKey: ["superadmin", "agency", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (org.isLoading) return <ListSkeleton rows={6} />;
  if (!org.data) return <DetailNotFound title="Agenția nu a fost găsită" to="/superadmin/agencies" label="Înapoi la agenții" />;
  return <AgencyDetail org={org.data} />;
}

export function AgencyDetail({ org }: { org: Tables<"organizations"> }) {
  const badge = orgStatusBadge(org);
  const logoUrl = useAgencyLogoUrl(org.logo_path);
  const fetchUsers = useServerFn(listPlatformUsers);
  const users = useQuery({ queryKey: ["superadmin", "users"], queryFn: () => fetchUsers() });
  const members = (users.data?.users ?? []).filter((u) => u.organization_id === org.id);
  const portals = useQuery({
    queryKey: ["superadmin", "agency", org.id, "portals"],
    queryFn: async () => {
      // Doar coloane de stare; cheile și parolele nu se citesc niciodată.
      const { data } = await supabase.from("portal_connections").select("portal,activated,last_sync_status,last_sync_error,last_sync_at").eq("organization_id", org.id);
      return data ?? [];
    },
  });
  const activity = useQuery({
    queryKey: ["superadmin", "agency", org.id, "audit"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_logs").select("id,action,created_at").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(8);
      return data ?? [];
    },
  });
  const summary = subscriptionSummary(org);
  const limit = planAgentLimit(org.plan);
  const seatsUsed = members.filter((m) => m.is_active && m.roles.includes("agent")).length;

  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <BackLink to="/superadmin/agencies" label="Înapoi la agenții" />
      <header className="flex flex-col gap-4 rounded-[22px] border border-border/70 bg-card p-5 shadow-sm sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt={`Logo ${org.name}`} className="size-16 shrink-0 rounded-2xl border border-border object-contain p-1" />
          ) : (
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gold/15 text-lg font-semibold" aria-hidden>{initials(org.name)}</span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold text-foreground">{org.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
              {org.company_status === "inactiva" ? <StatusBadge tone="danger">Firmă inactivă (ANAF)</StatusBadge> : null}
              {org.is_demo ? <StatusBadge tone="warning">DEMO / QA</StatusBadge> : null}
            </div>
          </div>
        </div>
        <AgencyHeaderActions org={org} />
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <DetailCard title="Date firmă">
          <dl className="divide-y divide-border">
            <DetailRow label="Denumire legală">{org.legal_name}</DetailRow>
            <DetailRow label="CUI">{org.cui}</DetailRow>
            <DetailRow label="Reg. Com.">{org.trade_registry_number}</DetailRow>
            <DetailRow label="Reprezentant">{org.legal_representative ? `${org.legal_representative}${org.legal_representative_title ? ` (${org.legal_representative_title})` : ""}` : null}</DetailRow>
            <DetailRow label="Email">{org.email}</DetailRow>
            <DetailRow label="Telefon">{org.phone}</DetailRow>
            <DetailRow label="Adresă">{[org.city, org.postal_code].filter(Boolean).join(", ") || null}</DetailRow>
            <DetailRow label="Înscrisă">{formatDate(org.created_at)}</DetailRow>
          </dl>
        </DetailCard>

        <DetailCard title="Abonament și plan">
          <dl className="mb-4 divide-y divide-border">
            <DetailRow label="Plan">{PLAN_LABELS[normalizePlan(org.plan)]} · {planPriceLabel(org.plan, org.subscription_term)}</DetailRow>
            <DetailRow label="Perioadă">{subscriptionTermLabel(org.subscription_term)} · {summary.label}</DetailRow>
            {summary.detail ? <DetailRow label="Detalii">{summary.detail}</DetailRow> : null}
            <DetailRow label="Locuri folosite">{limit === null ? `${seatsUsed} · fără limită` : `${seatsUsed} din ${seatLimitLabel(limit)}`}</DetailRow>
          </dl>
          <AgencySubscriptionControls org={org} />
        </DetailCard>

        <DetailCard title="Echipă" description={`${members.length} membri`}>
          {users.isLoading ? <ListSkeleton rows={3} /> : members.length === 0 ? <p className="text-sm text-muted-foreground">Niciun membru.</p> : (
            <ul className="divide-y divide-border">
              {members.map((m) => {
                const s = userStatusBadge(m.is_active);
                return (
                  <li key={m.id}>
                    <Link to="/superadmin/users/$id" params={{ id: m.id }} className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl py-2 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      <UserAvatar name={m.full_name} path={m.avatar_url} className="size-10 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.full_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{m.roles.map((r) => roleLabels[r] ?? r).join(", ")}</span>
                      </span>
                      <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </DetailCard>

        <DetailCard title="Portaluri" description="Doar starea conexiunii; datele de acces nu sunt afișate.">
          {portals.isLoading ? <ListSkeleton rows={3} /> : (portals.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Niciun portal conectat.</p> : (
            <ul className="divide-y divide-border">
              {(portals.data ?? []).map((p) => {
                const st = PORTAL_CONNECTION_LABEL[portalDisplayStatus({ activated: p.activated === true, configured: true, lastError: p.last_sync_error, lastSyncStatus: p.last_sync_status })];
                return (
                  <li key={p.portal} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{portalDisplayName(p.portal as PortalId)}</span>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  </li>
                );
              })}
            </ul>
          )}
        </DetailCard>

        {(activity.data ?? []).length ? (
          <DetailCard title="Activitate recentă" className="xl:col-span-2">
            <ul className="divide-y divide-border">
              {(activity.data ?? []).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 break-all">{a.action}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </DetailCard>
        ) : null}
      </div>
    </div>
  );
}
