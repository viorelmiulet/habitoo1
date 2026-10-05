import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Mail, Phone, Search, UserPlus, Users } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { EmptyState } from "@/components/app/EmptyState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-session";
import { UserAvatar } from "@/components/app/UserAvatar";
import { roleLabels } from "@/lib/labels";
import { getTeamOverview, inviteAgent, type TeamMember } from "@/lib/agency-team.functions";
import { appHead } from "@/components/app/app-head";
import { mobilePhoneSchema, normalizeRoMobile } from "@/lib/user-profile";
import { TeamMemberActions, teamQueryKey } from "@/components/app/team/TeamMemberActions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/team/")({
  head: () => appHead("Habitoo CRM — agenți"),
  component: TeamPage,
});

type Filter = "all" | "active" | "inactive" | "invited" | "nophone";

const FILTERS: { key: Filter; label: string; match: (m: TeamMember) => boolean }[] = [
  { key: "all", label: "Toți", match: () => true },
  { key: "active", label: "Activi", match: (m) => m.is_active },
  { key: "inactive", label: "Inactivi", match: (m) => !m.is_active },
  { key: "invited", label: "Invitații", match: (m) => m.invited },
  { key: "nophone", label: "Fără telefon", match: (m) => normalizeRoMobile(m.phone) === null },
];

function TeamPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getTeamOverview);
  const invite = useServerFn(inviteAgent);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", phone: "" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const isAdmin = user?.isAdmin ?? false;

  const { data, isLoading, error } = useQuery({
    queryKey: teamQueryKey,
    queryFn: () => fetchOverview(),
    enabled: isAdmin,
  });

  const inviteMutation = useMutation({
    mutationFn: () => {
      const phone = mobilePhoneSchema.safeParse(form.phone);
      if (!phone.success) throw new Error(phone.error.issues[0]?.message ?? "Telefon invalid.");
      return invite({ data: { email: form.email, full_name: form.full_name, phone: form.phone } });
    },
    onSuccess: (overview) => {
      queryClient.setQueryData(teamQueryKey, overview);
      setOpen(false);
      setForm({ email: "", full_name: "", phone: "" });
      toast.success("Invitația a fost trimisă prin email.");
    },
    onError: (e: Error) => toastError(e),
  });

  const members = data?.members ?? [];
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ro");
    const f = FILTERS.find((x) => x.key === filter)!;
    return members.filter(
      (m) =>
        f.match(m) &&
        (!q || [m.full_name, m.email, m.phone].some((v) => v?.toLocaleLowerCase("ro").includes(q))),
    );
  }, [members, query, filter]);

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Agenți" description="Echipa agenției tale." />
        <div className="panel p-6 text-sm text-muted-foreground">
          Doar administratorul agenției poate gestiona agenții.
        </div>
      </>
    );
  }

  const limitReached = data ? !data.canInvite : false;
  const seatPct =
    data && data.seatLimit ? Math.min(100, Math.round((data.seatsUsed / data.seatLimit) * 100)) : 0;

  return (
    <>
      <PageHeader
        title="Agenți"
        description="Echipa agenției tale: cine e activ, cine are invitația în așteptare și cine are nevoie de date."
        actions={
          <Button onClick={() => setOpen(true)} disabled={!data || limitReached}>
            <UserPlus className="size-4" />
            Adaugă agent
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div data-tour="team-seats" className="panel p-4 sm:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{data ? `Plan ${data.planLabel}` : "Plan"}</p>
              <p className="mt-1 text-lg font-semibold">
                {data
                  ? data.seatLimit === null
                    ? `${data.seatsUsed} agenți activi`
                    : `${data.seatsUsed} din ${data.seatLimit} locuri`
                  : "—"}
              </p>
            </div>
            {data ? (
              <StatusBadge tone={limitReached ? "warning" : "success"}>
                {limitReached
                  ? "Limită atinsă"
                  : data.seatLimit === null
                    ? "Locuri nelimitate"
                    : `${data.seatLimit - data.seatsUsed} locuri libere`}
              </StatusBadge>
            ) : null}
          </div>
          {data?.seatLimit ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className={cn("h-full rounded-full", limitReached ? "bg-warning" : "bg-primary")}
                style={{ width: `${seatPct}%` }}
              />
            </div>
          ) : null}
        </div>
        <Stat label="Invitații în așteptare" value={data ? members.filter((m) => m.invited).length : null} />
        <Stat
          label="Fără telefon valid"
          value={data ? members.filter((m) => normalizeRoMobile(m.phone) === null).length : null}
          warn
        />
      </div>

      {limitReached && data?.upgradeHint ? (
        <div className="panel border-warning/40 bg-warning/10 p-4 text-sm">{data.upgradeHint}</div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrează agenții">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              className="h-10 rounded-full sm:h-9"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {data ? <span className="ml-1 opacity-70">{members.filter(f.match).length}</span> : null}
            </Button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Caută nume, email, telefon…"
            className="pl-9"
            aria-label="Caută agenți"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="panel overflow-hidden">
          <ListSkeleton rows={5} />
        </div>
      ) : error ? (
        <div className="panel p-6 text-sm text-destructive">{(error as Error).message}</div>
      ) : members.length === 0 ? (
        <div className="panel">
          <EmptyState icon={Users} title="Niciun membru în agenție" />
        </div>
      ) : visible.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-muted-foreground">
          Niciun agent nu corespunde filtrului.
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((m) => (
            <li key={m.id} className={cn("panel flex flex-col gap-3 p-4", !m.is_active && "opacity-70")}>
              <div className="flex items-start gap-3">
                <UserAvatar name={m.full_name} path={m.avatar_url} className="size-12 text-sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/app/team/$id"
                    params={{ id: m.id }}
                    className="block truncate font-semibold hover:text-primary"
                  >
                    {m.full_name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.job_title || m.roles.map((r) => roleLabels[r] ?? r).join(" · ")}
                  </p>
                </div>
                <TeamMemberActions member={m} members={members} currentUserId={user?.userId} />
              </div>
              <div className="space-y-1 text-sm">
                <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="truncate">{m.email ?? "—"}</span>
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="size-3.5 shrink-0" />
                  {m.phone || "—"}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap gap-1.5">
                {m.roles.map((r) => (
                  <StatusBadge key={r} tone="primary">
                    {roleLabels[r] ?? r}
                  </StatusBadge>
                ))}
                <StatusBadge tone={m.is_active ? "success" : "neutral"} dot>
                  {m.is_active ? "Activ" : "Inactiv"}
                </StatusBadge>
                {m.invited ? <StatusBadge tone="warning">Invitație trimisă</StatusBadge> : null}
                {normalizeRoMobile(m.phone) === null ? (
                  <StatusBadge tone="warning">Fără telefon — nu poate publica</StatusBadge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă agent</DialogTitle>
            <DialogDescription>
              Agentul primește un email de invitație pentru a-și seta parola și intră direct în
              agenția ta.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              inviteMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="agent_name">Nume complet</Label>
              <Input
                id="agent_name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent_email">Email</Label>
              <Input
                id="agent_email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent_phone">Telefon mobil</Label>
              <Input
                id="agent_phone"
                type="tel"
                inputMode="tel"
                placeholder="0722 123 456"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Anulează
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                Trimite invitația
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | null; warn?: boolean }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", warn && value ? "text-warning-foreground" : "")}>
        {value ?? "—"}
      </p>
    </div>
  );
}
