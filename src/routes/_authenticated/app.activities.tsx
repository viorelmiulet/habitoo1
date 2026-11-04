import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ListChecks,
  Phone,
  Mail,
  Users,
  Home,
  CheckCircle2,
  XCircle,
  X,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
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
import { useFilterList } from "@/hooks/use-list-state";
import { validateListSearch } from "@/lib/list-state";
import { appHead } from "@/components/app/app-head";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/activities")({
  head: () => { const title = "Habitoo CRM — activități"; const description = "Activitățile agenției, programări și filtre pe responsabil, tip și perioadă."; const head = appHead(title); return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  validateSearch: (search: Record<string, unknown>) => validateListSearch(activityListDefaults, search),
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

function sameDayAsToday(day: string) {
  return new Date(day).toDateString() === new Date().toDateString();
}

const activityListDefaults = { status: "planned", kind: "all", agent: "all", period: "all", q: "" };

function ActivitiesPage() {
  const { new: openNew } = Route.useSearch();
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(Boolean(openNew));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = useNavigate({ from: Route.fullPath });
  const persisted = useFilterList("activities", user?.userId, activityListDefaults, Route.useSearch(),
    (next) => { void navigate({ search: next, replace: true, resetScroll: false }); });
  const statusFilter = persisted.state.status;
  const setStatusFilter = (value: string) => persisted.set("status", value);
  const kindFilter = persisted.state.kind;
  const setKindFilter = (value: string) => persisted.set("kind", value);
  const agentFilter = persisted.state.agent;
  const setAgentFilter = (value: string) => persisted.set("agent", value);
  const periodFilter = persisted.state.period;
  const setPeriodFilter = (value: string) => persisted.set("period", value);
  const searchInput = persisted.state.q;
  const setSearchInput = (value: string) => persisted.set("q", value);
  const search = useDebounced(searchInput);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reschedule, setReschedule] = useState<Activity | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");

  const queryKey = ["activities", orgId] as const;
  const { data, isLoading } = useQuery({
    queryKey,
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [activities, properties, contacts, leadsRes, requestsRes, profiles] = await Promise.all(
        [
          supabase
            .from("activities")
            .select("*")
            .eq("organization_id", orgId as string)
            .order("starts_at", { ascending: true }),
          supabase
            .from("properties")
            .select("id,title")
            .eq("organization_id", orgId as string),
          supabase
            .from("contacts")
            .select("id,first_name,last_name")
            .eq("organization_id", orgId as string),
          supabase
            .from("leads")
            .select("id,name")
            .eq("organization_id", orgId as string),
          supabase
            .from("requests")
            .select("id,title")
            .eq("organization_id", orgId as string),
          supabase
            .from("profiles")
            .select("id,full_name")
            .eq("organization_id", orgId as string),
        ],
      );
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

  const propertyById = useMemo(
    () => new Map((data?.properties ?? []).map((p) => [p.id, p.title])),
    [data],
  );
  const contactById = useMemo(
    () => new Map((data?.contacts ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`])),
    [data],
  );
  const leadById = useMemo(() => new Map((data?.leads ?? []).map((l) => [l.id, l.name])), [data]);
  const requestById = useMemo(
    () => new Map((data?.requests ?? []).map((r) => [r.id, r.title])),
    [data],
  );
  const profileById = useMemo(
    () => new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name])),
    [data],
  );

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "planned" | "done" | "cancelled";
    }) => {
      const { error } = await supabase
        .from("activities")
        .update({ status: status as never, done: status === "done" })
        .eq("id", id);
      if (error) throw error;
      await logAudit({
        organizationId: orgId,
        actorId: user?.userId,
        action: "activity.status",
        entity: "activity",
        entityId: id,
        newValues: { status },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (e: Error) => toastError(e),
  });

  const bulkUpdate = useMutation({
    mutationFn: async ({
      ids,
      status,
    }: {
      ids: string[];
      status: "planned" | "done" | "cancelled";
    }) => {
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
    onError: (e: Error) => toastError(e),
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
    onError: (e: Error) => toastError(e),
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
    onError: (e: Error) => toastError(e),
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
      if (!a.title.toLowerCase().includes(q) && !(a.description ?? "").toLowerCase().includes(q))
        return false;
    }
    return true;
  });

  const nowMs = now.getTime();
  /** Restanțele sunt afișate separat, sus; restul rămâne agendă pe zile. */
  const overdueRows = rows.filter(
    (a) => a.status === "planned" && new Date(a.starts_at).getTime() < nowMs,
  );
  const upcomingRows = rows.filter(
    (a) => !(a.status === "planned" && new Date(a.starts_at).getTime() < nowMs),
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of upcomingRows) {
      const key = new Date(a.starts_at).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** Un rând de agendă: ora pe stânga, pictogramă după tip, titlu și context. */
  const renderRow = (a: Activity) => {
    const Icon = kindIcon[a.kind] ?? ListChecks;
    const overdue = a.status === "planned" && new Date(a.starts_at) < now;
    const context = [
      a.contact_id ? `Contact: ${contactById.get(a.contact_id) ?? "—"}` : null,
      a.property_id ? `Proprietate: ${propertyById.get(a.property_id) ?? "—"}` : null,
      a.lead_id ? `Lead: ${leadById.get(a.lead_id) ?? "—"}` : null,
      a.request_id ? `Cerere: ${requestById.get(a.request_id) ?? "—"}` : null,
    ].filter(Boolean) as string[];
    return (
      <li key={a.id} className="flex min-h-[52px] flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 text-sm hover:bg-muted sm:flex-nowrap sm:px-5">
        <Checkbox
          className="mt-1"
          checked={selected.has(a.id)}
          onCheckedChange={() => toggleSelect(a.id)}
        />
        <div className="w-14 shrink-0 pt-0.5 text-[13px] tabular-nums sm:w-24">
          <p className={overdue ? "font-medium text-destructive" : "text-muted-foreground"}>
            {new Date(a.starts_at).toLocaleTimeString("ro-RO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-xs text-muted-foreground">{a.duration_minutes} min</p>
        </div>
        <span
          className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${
            overdue ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 basis-[calc(100%-8rem)] sm:basis-auto">
          <p
            className={
              a.status === "done"
                ? "truncate text-muted-foreground line-through"
                : "truncate font-semibold"
            }
          >
            {a.title}
          </p>
          {a.description ? (
            <p className="truncate text-[13px] text-muted-foreground">{a.description}</p>
          ) : null}
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {[activityKindLabels[a.kind], ...context, profileById.get(a.assigned_to ?? "") ?? null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex w-full items-center justify-between gap-2 pl-7 sm:w-auto sm:justify-end sm:gap-3 sm:pl-0">
        <StatusBadge tone={activityStatusTone[a.status]}>
          {activityStatusLabels[a.status]}
        </StatusBadge>
        <div className="flex items-center gap-0.5">
          {a.status !== "done" ? (
            <Button
              size="icon"
              variant="ghost"
              title="Finalizează" className="size-11 sm:size-10"
              onClick={() => updateStatus.mutate({ id: a.id, status: "done" })}
            >
              <CheckCircle2 className="size-4" />
            </Button>
          ) : null}
          {a.status !== "cancelled" ? (
            <Button
              size="icon"
              variant="ghost"
              title="Anulează" className="size-11 sm:size-10"
              onClick={() => updateStatus.mutate({ id: a.id, status: "cancelled" })}
            >
              <XCircle className="size-4" />
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            title="Reprogramează" className="size-11 sm:size-10"
            data-tour="activity-reschedule"
            onClick={() => {
              setReschedule(a);
              setRescheduleValue(a.starts_at.slice(0, 16));
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" title="Șterge" className="size-11 sm:size-10">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Ștergi activitatea?</AlertDialogTitle>
                <AlertDialogDescription>
                  „{a.title}” va fi ștearsă definitiv.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Anulează</AlertDialogCancel>
                <AlertDialogAction onClick={() => removeActivity.mutate(a.id)}>
                  Șterge
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        </div>
      </li>
    );
  };

  const activeFilterCount = [statusFilter !== "planned", kindFilter !== "all", agentFilter !== "all", periodFilter !== "all"].filter(Boolean).length;
  const FilterFields = () => (
    <>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="h-10 w-full rounded-[10px] sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="planned">Planificate</SelectItem>
            <SelectItem value="done">Finalizate</SelectItem>
            <SelectItem value="cancelled">Anulate</SelectItem>
            <SelectItem value="all">Toate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="h-10 w-full rounded-[10px] sm:w-40">
            <SelectValue placeholder="Tip" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate tipurile</SelectItem>
            {Object.entries(activityKindLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="h-10 w-full rounded-[10px] sm:w-40">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toți agenții</SelectItem>
            {(data?.profiles ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={periodFilter}
          onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}
        >
          <SelectTrigger className="h-10 w-full rounded-[10px] sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toată perioada</SelectItem>
            <SelectItem value="today">Azi</SelectItem>
            <SelectItem value="week">Săptămâna asta</SelectItem>
            <SelectItem value="overdue">Restante</SelectItem>
          </SelectContent>
        </Select>
    </>
  );

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

      <div data-tour="activities-filters" className="mb-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-card p-4 sm:p-3">
        <Input
          data-tour="activities-search"
          placeholder="Caută…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-10 w-full rounded-[10px] sm:w-52"
        />
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 rounded-[10px] sm:hidden"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal className="size-4" /> Filtre ({activeFilterCount})
        </Button>
        <div className="hidden sm:contents">
          <FilterFields />
          <Button variant="link" size="sm" className="px-1 text-sm font-semibold text-gold-dark" onClick={persisted.reset}><X className="size-4" /> Șterge filtre</Button>
        </div>
        {selected.size > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <span className="text-xs text-muted-foreground">{selected.size} selectate</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkUpdate.mutate({ ids: Array.from(selected), status: "done" })}
            >
              Finalizează
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkUpdate.mutate({ ids: Array.from(selected), status: "cancelled" })}
            >
              Anulează
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-10 w-full rounded-[10px] sm:ml-auto sm:w-auto" onClick={exportCsv}>
            Export CSV
          </Button>
        )}
      </div>


      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filtre</SheetTitle>
          </SheetHeader>
          <div className="grid gap-3 px-4 py-2">
            <FilterFields />
          </div>
          <SheetFooter className="flex-col gap-2">
            <Button className="h-11 w-full" onClick={() => setFiltersOpen(false)}>Aplică</Button>
            <Button variant="outline" className="h-11 w-full" onClick={persisted.reset}>Resetează</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
        {isLoading ? (
          <ListSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nicio activitate"
            description="Programează un apel sau o vizionare pentru a începe."
            action={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                Adaugă activitate
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border/70">
            {overdueRows.length > 0 ? (
              <div>
                <div className="flex items-center justify-between gap-2 bg-danger-tint px-4 py-2.5 text-xs font-semibold tracking-wide sm:px-5 text-destructive uppercase">
                  <span>Restante</span>
                  <span>{overdueRows.length}</span>
                </div>
                <ul className="divide-y divide-border/70">{overdueRows.map(renderRow)}</ul>
              </div>
            ) : null}
            {grouped.map(([day, items]) => (
              <div key={day}>
                <div className="bg-muted/60 px-4 py-2.5 text-xs font-semibold tracking-wide sm:px-5 text-muted-foreground uppercase">
                  {sameDayAsToday(day)
                    ? "Azi"
                    : new Date(day).toLocaleDateString("ro-RO", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                </div>
                <ul className="divide-y divide-border/70">{items.map(renderRow)}</ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {reschedule ? (
        <AlertDialog open={Boolean(reschedule)} onOpenChange={(v) => !v && setReschedule(null)}>
          <AlertDialogContent data-tour="activity-reschedule-form">
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

      <ActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgId={orgId}
        userId={user?.userId}
      />
    </>
  );
}
