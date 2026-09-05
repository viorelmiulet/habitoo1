import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ListChecks, Phone, Mail, Users, Home, CheckCircle2, XCircle, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { ActivityDialog } from "@/components/app/ActivityDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { formatDateTime } from "@/lib/format";
import { activityKindLabels } from "@/lib/labels";
import { activityStatusLabels, activityStatusTone, downloadCsv, logAudit } from "@/lib/crm";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/app/activities")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } =>
    search["new"] === true || search["new"] === "true" ? { new: true } : {},
  component: ActivitiesPage,
});

type Activity = Tables<"activities">;

const kindIcon: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  viewing: Home,
  task: ListChecks,
  followup: Phone,
  note: ListChecks,
};

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useMemo(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return debounced;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function ActivitiesPage() {
  const { new: openNew } = Route.useSearch();
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(Boolean(openNew));
  const [statusFilter, setStatusFilter] = useState<"planned" | "done" | "cancelled" | "all">("planned");
  const [kindFilter, setKindFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<"today" | "week" | "overdue" | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reschedule, setReschedule] = useState<Activity | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");

  const queryKey = ["activities", orgId] as const;
  const { data, isLoading } = useQuery({
    queryKey,
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [activities, properties, contacts, leadsRes, requestsRes, profiles] = await Promise.all([
        supabase.from("activities").select("*").eq("organization_id", orgId as string).order("starts_at", { ascending: true }),
        supabase.from("properties").select("id,title").eq("organization_id", orgId as string),
        supabase.from("contacts").select("id,first_name,last_name").eq("organization_id", orgId as string),
        supabase.from("leads").select("id,name").eq("organization_id", orgId as string),
        supabase.from("requests").select("id,title").eq("organization_id", orgId as string),
        supabase.from("profiles").select("id,full_name").eq("organization_id", orgId as string),
      ]);
      if (activities.error) throw activities.error;
      return {
        activities: (activities.data ?? []) as Activity[],
        properties: properties.data ?? [],
        contacts: contacts.data ?? [],
        leads: leadsRes.data ?? [],
        requests: requestsRes.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
  });

  const propertyById = useMemo(() => new Map((data?.properties ?? []).map((p) => [p.id, p.title])), [data]);
  const contactById = useMemo(
    () => new Map((data?.contacts ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`])),
    [data],
  );
  const leadById = useMemo(() => new Map((data?.leads ?? []).map((l) => [l.id, l.name])), [data]);
  const requestById = useMemo(() => new Map((data?.requests ?? []).map((r) => [r.id, r.title])), [data]);
  const profileById = useMemo(() => new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name])), [data]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "planned" | "done" | "cancelled" }) => {
      const { error } = await supabase
        .from("activities")
        .update({ status: status as never, done: status === "done" })
        .eq("id", id);
      if (error) throw error;
      await logAudit({ organizationId: orgId, actorId: user?.userId, action: "activity.status", entity: "activity", entityId: id, newValues: { status } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: "planned" | "done" | "cancelled" }) => {
      const { error } = await supabase
        .from("activities")
        .update({ status: status as never, done: status === "done" })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setSelected(new Set());
      toast.success("Actualizat.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeActivity = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Activitate ștearsă.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doReschedule = useMutation({
    mutationFn: async () => {
      if (!reschedule || !rescheduleValue) return;
      const startsAt = new Date(rescheduleValue);
      const endsAt = new Date(startsAt.getTime() + (reschedule.duration_minutes || 30) * 60_000);
      const { error } = await supabase
        .from("activities")
        .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
        .eq("id", reschedule.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setReschedule(null);
      toast.success("Reprogramat.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const now = new Date();
  const rows = (data?.activities ?? []).filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (kindFilter !== "all" && a.kind !== kindFilter) return false;
    if (agentFilter !== "all" && a.assigned_to !== agentFilter) return false;
    if (periodFilter === "today") {
      const d = new Date(a.starts_at);
      if (d < startOfDay(now) || d > endOfDay(now)) return false;
    } else if (periodFilter === "week") {
      const d = new Date(a.starts_at);
      const start = startOfWeek(now);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      if (d < start || d >= end) return false;
    } else if (periodFilter === "overdue") {
      if (a.status !== "planned" || new Date(a.starts_at) >= now) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !(a.description ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of rows) {
      const key = new Date(a.starts_at).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries());
  }, [rows]);

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    const items = rows.filter((a) => selected.size === 0 || selected.has(a.id));
    downloadCsv(
      "activitati.csv",
      items.map((a) => ({
        titlu: a.title,
        tip: activityKindLabels[a.kind],
        status: activityStatusLabels[a.status],
        data: formatDateTime(a.starts_at),
        durata: a.duration_minutes,
        responsabil: profileById.get(a.assigned_to ?? "") ?? "",
      })),
    );
  };

  return (
    <>
      <PageHeader
        title="Activități"
        description="Apeluri, întâlniri, vizionări și task-uri, cu bifare rapidă."
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            Adaugă activitate
          </Button>
        }
      />

      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <Input
          placeholder="Caută…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-52"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="planned">Planificate</SelectItem>
            <SelectItem value="done">Finalizate</SelectItem>
            <SelectItem value="cancelled">Anulate</SelectItem>
            <SelectItem value="all">Toate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tip" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate tipurile</SelectItem>
            {Object.entries(activityKindLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Agent" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toți agenții</SelectItem>
            {(data?.profiles ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toată perioada</SelectItem>
            <SelectItem value="today">Azi</SelectItem>
            <SelectItem value="week">Săptămâna asta</SelectItem>
            <SelectItem value="overdue">Restante</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size} selectate</span>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate.mutate({ ids: Array.from(selected), status: "done" })}>
              Finalizează
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate.mutate({ ids: Array.from(selected), status: "cancelled" })}>
              Anulează
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>Export CSV</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv}>Export CSV</Button>
        )}
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Se încarcă…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nicio activitate"
            description="Programează un apel sau o vizionare pentru a începe."
            action={<Button size="sm" onClick={() => setDialogOpen(true)}>Adaugă activitate</Button>}
          />
        ) : (
          <div className="divide-y divide-border">
            {grouped.map(([day, items]) => {
              const isOverdueDay = new Date(day) < startOfDay(now);
              return (
                <div key={day}>
                  <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide ${isOverdueDay ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                    {isOverdueDay ? "Restante · " : ""}
                    {new Date(day).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                  <ul className="divide-y divide-border">
                    {items.map((a) => {
                      const Icon = kindIcon[a.kind] ?? ListChecks;
                      const overdue = a.status === "planned" && new Date(a.starts_at) < now;
                      return (
                        <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                          <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} />
                          <Icon className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className={a.status === "done" ? "truncate text-muted-foreground line-through" : "truncate font-medium"}>
                              {a.title}
                            </p>
                            {a.description ? <p className="truncate text-xs text-muted-foreground">{a.description}</p> : null}
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              {a.contact_id ? <span>Contact: {contactById.get(a.contact_id) ?? "—"}</span> : null}
                              {a.property_id ? <span>Proprietate: {propertyById.get(a.property_id) ?? "—"}</span> : null}
                              {a.lead_id ? <span>Lead: {leadById.get(a.lead_id) ?? "—"}</span> : null}
                              {a.request_id ? <span>Cerere: {requestById.get(a.request_id) ?? "—"}</span> : null}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">{profileById.get(a.assigned_to ?? "") ?? "—"}</span>
                          <span className={`text-xs ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                            {formatDateTime(a.starts_at)} · {a.duration_minutes}min
                          </span>
                          <StatusBadge tone={activityStatusTone[a.status]}>{activityStatusLabels[a.status]}</StatusBadge>
                          <div className="flex items-center gap-1">
                            {a.status !== "done" ? (
                              <Button size="icon" variant="ghost" title="Finalizează" onClick={() => updateStatus.mutate({ id: a.id, status: "done" })}>
                                <CheckCircle2 className="size-4" />
                              </Button>
                            ) : null}
                            {a.status !== "cancelled" ? (
                              <Button size="icon" variant="ghost" title="Anulează" onClick={() => updateStatus.mutate({ id: a.id, status: "cancelled" })}>
                                <XCircle className="size-4" />
                              </Button>
                            ) : null}
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Reprogramează"
                              onClick={() => {
                                setReschedule(a);
                                setRescheduleValue(a.starts_at.slice(0, 16));
                              }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" title="Șterge">
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Ștergi activitatea?</AlertDialogTitle>
                                  <AlertDialogDescription>„{a.title}” va fi ștearsă definitiv.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Anulează</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeActivity.mutate(a.id)}>Șterge</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {reschedule ? (
        <AlertDialog open={Boolean(reschedule)} onOpenChange={(v) => !v && setReschedule(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reprogramează activitatea</AlertDialogTitle>
            </AlertDialogHeader>
            <Input
              type="datetime-local"
              value={rescheduleValue}
              onChange={(e) => setRescheduleValue(e.target.value)}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Renunță</AlertDialogCancel>
              <AlertDialogAction onClick={() => doReschedule.mutate()}>Salvează</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      <ActivityDialog open={dialogOpen} onOpenChange={setDialogOpen} orgId={orgId} userId={user?.userId} />
    </>
  );
}
