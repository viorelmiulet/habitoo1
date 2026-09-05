import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { ActivityDialog } from "@/components/app/ActivityDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatTime } from "@/lib/format";
import { activityKindLabels } from "@/lib/labels";
import { activityStatusLabels, activityStatusTone, logAudit } from "@/lib/crm";
import { useCurrentUser } from "@/hooks/use-session";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  component: CalendarPage,
});

type Activity = Tables<"activities">;
type ViewMode = "day" | "week" | "month";

const kindTone: Record<string, string> = {
  call: "border-info/40 bg-info/10 text-info",
  meeting: "border-primary/40 bg-primary/10 text-primary",
  viewing: "border-success/40 bg-success/10 text-success",
  task: "border-warning/40 bg-warning/10 text-warning-foreground",
  email: "border-muted-foreground/30 bg-muted text-muted-foreground",
  followup: "border-accent/40 bg-accent/10 text-accent-foreground",
  note: "border-border bg-card text-foreground",
};

const durationOptions = [15, 30, 45, 60, 90, 120];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 - 20:00

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}
function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function CalendarPage() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const orgId = currentUser?.profile?.organization_id;
  const userId = currentUser?.userId;

  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [onlyMine, setOnlyMine] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaults, setDialogDefaults] = useState<{ startsAt: Date } | undefined>(undefined);

  const [detail, setDetail] = useState<Activity | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "day") {
      const from = startOfDay(anchor);
      return { from, to: addDays(from, 1) };
    }
    if (view === "week") {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 7) };
    }
    const from = startOfWeek(startOfMonth(anchor));
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const to = addDays(startOfWeek(monthEnd), 7);
    return { from, to };
  }, [view, anchor]);

  const { data: agents = [] } = useQuery({
    queryKey: ["profiles", "org", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("organization_id", orgId as string)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["activities", "calendar", orgId, range.from.toISOString(), range.to.toISOString()],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("organization_id", orgId as string)
        .gte("starts_at", range.from.toISOString())
        .lte("starts_at", range.to.toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(
    () =>
      activities.filter((a) => {
        if (agentFilter !== "all" && a.assigned_to !== agentFilter) return false;
        if (kindFilter !== "all" && a.kind !== kindFilter) return false;
        if (onlyMine && a.assigned_to !== userId) return false;
        return true;
      }),
    [activities, agentFilter, kindFilter, onlyMine, userId],
  );

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.full_name ?? "—";

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, startsAt, durationMinutes }: { id: string; startsAt: Date; durationMinutes: number }) => {
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      const { error } = await supabase
        .from("activities")
        .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
      // Notă: aici s-ar declanșa în viitor sincronizarea cu Google Calendar (create/update event).
      await logAudit({
        organizationId: orgId,
        actorId: userId,
        action: "activity.reschedule",
        entity: "activity",
        entityId: id,
      });
    },
    onMutate: async ({ id, startsAt, durationMinutes }) => {
      await queryClient.cancelQueries({ queryKey: ["activities", "calendar"] });
      const previous = queryClient.getQueriesData<Activity[]>({ queryKey: ["activities", "calendar"] });
      queryClient.setQueriesData<Activity[]>({ queryKey: ["activities", "calendar"] }, (old) =>
        old?.map((a) =>
          a.id === id
            ? {
                ...a,
                starts_at: startsAt.toISOString(),
                ends_at: new Date(startsAt.getTime() + durationMinutes * 60_000).toISOString(),
              }
            : a,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error("Nu am putut reprograma activitatea.");
    },
    onSuccess: () => {
      toast.success("Activitate reprogramată.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["activities", "calendar"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload, action }: { id: string; payload: Record<string, unknown>; action: string }) => {
      const { error } = await supabase.from("activities").update(payload as never).eq("id", id);
      if (error) throw error;
      await logAudit({ organizationId: orgId, actorId: userId, action, entity: "activity", entityId: id });
    },
    onSuccess: (_d, vars) => {
      toast.success("Activitate actualizată.");
      queryClient.invalidateQueries({ queryKey: ["activities", "calendar"] });
      setDetail((prev) => (prev && prev.id === vars.id ? { ...prev, ...(vars.payload as Partial<Activity>) } : prev));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("activities").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ organizationId: orgId, actorId: userId, action: "activity.delete", entity: "activity", entityId: id });
    },
    onSuccess: () => {
      toast.success("Activitate ștearsă.");
      queryClient.invalidateQueries({ queryKey: ["activities", "calendar"] });
      setDeleteTarget(null);
      setDetail(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = (startsAt: Date) => {
    setDialogDefaults({ startsAt });
    setDialogOpen(true);
  };

  const openDetail = (activity: Activity) => {
    setDetail(activity);
    const d = new Date(activity.starts_at);
    setRescheduleDate(d.toISOString().slice(0, 10));
    setRescheduleTime(d.toISOString().slice(11, 16));
  };

  const handleDropOnDay = (day: Date) => {
    if (!draggedId) return;
    const activity = filtered.find((a) => a.id === draggedId);
    setDraggedId(null);
    if (!activity) return;
    const original = new Date(activity.starts_at);
    const next = new Date(day);
    next.setHours(original.getHours(), original.getMinutes(), 0, 0);
    if (sameDay(next, original)) return;
    rescheduleMutation.mutate({ id: activity.id, startsAt: next, durationMinutes: activity.duration_minutes || 30 });
  };

  const handleDropOnSlot = (day: Date, hour: number) => {
    if (!draggedId) return;
    const activity = filtered.find((a) => a.id === draggedId);
    setDraggedId(null);
    if (!activity) return;
    const next = new Date(day);
    next.setHours(hour, 0, 0, 0);
    rescheduleMutation.mutate({ id: activity.id, startsAt: next, durationMinutes: activity.duration_minutes || 30 });
  };

  const navigate = (dir: -1 | 1) => {
    if (view === "day") setAnchor((a) => addDays(a, dir));
    else if (view === "week") setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  };

  const rangeLabel = useMemo(() => {
    if (view === "day") return anchor.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
    if (view === "week") {
      const from = startOfWeek(anchor);
      const to = addDays(from, 6);
      return `${from.toLocaleDateString("ro-RO", { day: "numeric", month: "short" })} – ${to.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })}`;
    }
    return anchor.toLocaleDateString("ro-RO", { month: "long", year: "numeric" });
  }, [view, anchor]);

  const EventChip = ({ activity, compact }: { activity: Activity; compact?: boolean }) => (
    <button
      type="button"
      draggable
      onDragStart={() => setDraggedId(activity.id)}
      onClick={(e) => {
        e.stopPropagation();
        openDetail(activity);
      }}
      className={cn(
        "w-full cursor-grab rounded-md border px-2 py-1 text-left text-xs transition active:cursor-grabbing",
        kindTone[activity.kind] ?? "border-border bg-card",
        activity.status === "cancelled" && "opacity-50 line-through",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium">{formatTime(activity.starts_at)}</span>
        {activity.status === "done" ? <StatusBadge tone="success">✓</StatusBadge> : null}
      </div>
      {!compact && <p className="truncate">{activity.title}</p>}
      {compact && <p className="truncate">{activity.title}</p>}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Activități, vizionări și follow-up-uri ale echipei."
        actions={
          <>
            <div className="flex items-center overflow-hidden rounded-lg border border-border">
              {(["day", "week", "month"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium transition",
                    view === v ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted",
                  )}
                >
                  {v === "day" ? "Zi" : v === "week" ? "Săptămână" : "Lună"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              Azi
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(1)}>
              <ChevronRight className="size-4" />
            </Button>
            <Button size="sm" onClick={() => openCreate(new Date())}>
              Activitate nouă
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold">{rangeLabel}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toți agenții</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Tip activitate" />
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
          <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
            <Checkbox checked={onlyMine} onCheckedChange={(v) => setOnlyMine(Boolean(v))} />
            Doar ale mele
          </label>
        </div>
      </div>

      <div className="panel mt-4 overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center text-sm text-muted-foreground">Se încarcă activitățile…</div>
        ) : filtered.length === 0 && view !== "month" ? (
          <EmptyState
            icon={CalendarDays}
            title="Nicio activitate în acest interval"
            description="Adaugă o activitate nouă sau schimbă filtrele."
          />
        ) : view === "day" ? (
          <DayView
            day={anchor}
            activities={filtered}
            onSlotClick={openCreate}
            onDropSlot={handleDropOnSlot}
            EventChip={EventChip}
          />
        ) : view === "week" ? (
          <WeekView
            anchor={anchor}
            activities={filtered}
            onDayClick={openCreate}
            onDropDay={handleDropOnDay}
            EventChip={EventChip}
          />
        ) : (
          <MonthView
            anchor={anchor}
            activities={filtered}
            onDayClick={openCreate}
            onDropDay={handleDropOnDay}
            onEventClick={openDetail}
            draggedId={draggedId}
            setDraggedId={setDraggedId}
          />
        )}
      </div>

      <ActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgId={orgId}
        userId={userId}
        defaults={dialogDefaults}
      />

      <Sheet open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{detail.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="primary">{activityKindLabels[detail.kind]}</StatusBadge>
                  <StatusBadge tone={activityStatusTone[detail.status]}>
                    {activityStatusLabels[detail.status]}
                  </StatusBadge>
                </div>
                <p className="text-sm text-muted-foreground">{formatDateTime(detail.starts_at)}</p>
                {detail.description ? <p className="text-sm">{detail.description}</p> : null}

                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Responsabil: </span>
                    {agentName(detail.assigned_to)}
                  </p>
                  {detail.contact_id ? (
                    <p>
                      <Link to="/app/contacts/$id" params={{ id: detail.contact_id }} className="text-primary hover:underline">
                        Vezi contactul asociat
                      </Link>
                    </p>
                  ) : null}
                  {detail.property_id ? (
                    <p>
                      <Link to="/app/properties/$id" params={{ id: detail.property_id }} className="text-primary hover:underline">
                        Vezi proprietatea asociată
                      </Link>
                    </p>
                  ) : null}
                  {detail.lead_id ? (
                    <p>
                      <Link to="/app/leads" className="text-primary hover:underline">
                        Vezi lead-ul asociat
                      </Link>
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Durată</Label>
                  <Select
                    value={String(detail.duration_minutes)}
                    onValueChange={(v) => {
                      const startsAt = new Date(detail.starts_at);
                      const endsAt = new Date(startsAt.getTime() + Number(v) * 60_000);
                      updateMutation.mutate({
                        id: detail.id,
                        action: "activity.duration",
                        payload: { duration_minutes: Number(v), ends_at: endsAt.toISOString() },
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {durationOptions.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} min
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">Reprogramează</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
                    <Input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const startsAt = new Date(`${rescheduleDate}T${rescheduleTime || "00:00"}:00`);
                      rescheduleMutation.mutate({
                        id: detail.id,
                        startsAt,
                        durationMinutes: detail.duration_minutes || 30,
                      });
                    }}
                  >
                    Salvează noua dată
                  </Button>
                </div>
              </div>
              <SheetFooter className="mt-6 flex-row flex-wrap gap-2 sm:justify-start">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={detail.status === "done"}
                  onClick={() =>
                    updateMutation.mutate({
                      id: detail.id,
                      action: "activity.done",
                      payload: { status: "done", done: true },
                    })
                  }
                >
                  Finalizează
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={detail.status === "cancelled"}
                  onClick={() =>
                    updateMutation.mutate({
                      id: detail.id,
                      action: "activity.cancel",
                      payload: { status: "cancelled" },
                    })
                  }
                >
                  Anulează
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(detail)}>
                  <Trash2 className="mr-1 size-4" /> Șterge
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ștergi această activitate?</AlertDialogTitle>
            <AlertDialogDescription>
              Acțiunea este ireversibilă. Activitatea „{deleteTarget?.title}” va fi ștearsă definitiv.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Renunță</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Șterge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DayView({
  day,
  activities,
  onSlotClick,
  onDropSlot,
  EventChip,
}: {
  day: Date;
  activities: Activity[];
  onSlotClick: (d: Date) => void;
  onDropSlot: (d: Date, hour: number) => void;
  EventChip: (props: { activity: Activity; compact?: boolean }) => React.JSX.Element;
}) {
  return (
    <div className="divide-y divide-border">
      {HOURS.map((hour) => {
        const slot = new Date(day);
        slot.setHours(hour, 0, 0, 0);
        const items = activities.filter((a) => {
          const s = new Date(a.starts_at);
          return sameDay(s, day) && s.getHours() === hour;
        });
        return (
          <div
            key={hour}
            className="flex min-h-16 gap-3 p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropSlot(day, hour)}
            onClick={() => onSlotClick(slot)}
          >
            <span className="w-14 shrink-0 pt-1 text-xs text-muted-foreground">{String(hour).padStart(2, "0")}:00</span>
            <div className="flex-1 space-y-1">
              {items.map((a) => (
                <EventChip key={a.id} activity={a} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({
  anchor,
  activities,
  onDayClick,
  onDropDay,
  EventChip,
}: {
  anchor: Date;
  activities: Activity[];
  onDayClick: (d: Date) => void;
  onDropDay: (d: Date) => void;
  EventChip: (props: { activity: Activity; compact?: boolean }) => React.JSX.Element;
}) {
  const from = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className="grid md:grid-cols-7">
      {days.map((day) => {
        const items = activities.filter((a) => sameDay(new Date(a.starts_at), day));
        const isToday = sameDay(day, new Date());
        return (
          <div
            key={day.toISOString()}
            className="flex min-h-64 flex-col border-b border-border md:border-r md:border-b-0 md:last:border-r-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropDay(day)}
          >
            <div
              className={cn("cursor-pointer border-b border-border px-3 py-2", isToday && "bg-primary/10")}
              onClick={() => onDayClick(day)}
            >
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                {day.toLocaleDateString("ro-RO", { weekday: "short" })}
              </p>
              <p className="text-sm font-semibold">{day.toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}</p>
            </div>
            <div className="flex-1 space-y-1.5 p-2">
              {items.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">—</p>
              ) : (
                items.map((a) => <EventChip key={a.id} activity={a} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  anchor,
  activities,
  onDayClick,
  onDropDay,
  onEventClick,
  draggedId,
  setDraggedId,
}: {
  anchor: Date;
  activities: Activity[];
  onDayClick: (d: Date) => void;
  onDropDay: (d: Date) => void;
  onEventClick: (a: Activity) => void;
  draggedId: string | null;
  setDraggedId: (id: string | null) => void;
}) {
  const from = startOfWeek(startOfMonth(anchor));
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const to = addDays(startOfWeek(monthEnd), 7);
  const days: Date[] = [];
  for (let d = new Date(from); d < to; d = addDays(d, 1)) days.push(new Date(d));

  return (
    <div className="grid grid-cols-7">
      {["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"].map((d) => (
        <div key={d} className="border-b border-border px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
          {d}
        </div>
      ))}
      {days.map((day) => {
        const items = activities.filter((a) => sameDay(new Date(a.starts_at), day));
        const isToday = sameDay(day, new Date());
        const inMonth = day.getMonth() === anchor.getMonth();
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "min-h-28 border-b border-r border-border p-1.5 last:border-r-0",
              !inMonth && "bg-muted/40 text-muted-foreground",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropDay(day)}
            onClick={() => onDayClick(day)}
          >
            <p className={cn("mb-1 text-xs font-semibold", isToday && "text-primary")}>{day.getDate()}</p>
            <div className="space-y-1">
              {items.slice(0, 3).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  draggable
                  onDragStart={() => setDraggedId(a.id)}
                  onDragEnd={() => setDraggedId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(a);
                  }}
                  className={cn(
                    "block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px]",
                    kindTone[a.kind] ?? "border-border bg-card",
                    a.status === "cancelled" && "opacity-50 line-through",
                    draggedId === a.id && "opacity-30",
                  )}
                >
                  {formatTime(a.starts_at)} {a.title}
                </button>
              ))}
              {items.length > 3 ? (
                <p className="text-[11px] text-muted-foreground">+{items.length - 3} altele</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
