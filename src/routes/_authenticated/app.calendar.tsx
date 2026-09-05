import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatTime } from "@/lib/format";
import { activityKindLabels } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  component: CalendarPage,
});

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function CalendarPage() {
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));

  const { data: activities = [] } = useQuery({
    queryKey: ["activities", "calendar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(anchor);
        d.setDate(anchor.getDate() + i);
        return d;
      }),
    [anchor],
  );

  const shift = (weeks: number) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + weeks * 7);
    setAnchor(d);
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Săptămâna de lucru: vizionări, întâlniri și follow-up-uri."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => shift(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(startOfWeek(new Date()))}>
              Săptămâna curentă
            </Button>
            <Button variant="outline" size="sm" onClick={() => shift(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-7">
        {days.map((day) => {
          const items = activities.filter(
            (a) => new Date(a.starts_at).toDateString() === day.toDateString(),
          );
          const isToday = day.toDateString() === new Date().toDateString();
          return (
            <div key={day.toISOString()} className="panel flex min-h-48 flex-col">
              <div
                className={`border-b border-border px-3 py-2 ${isToday ? "bg-primary/10" : ""}`}
              >
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  {day.toLocaleDateString("ro-RO", { weekday: "short" })}
                </p>
                <p className="text-sm font-semibold">
                  {day.toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}
                </p>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {items.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground">—</p>
                ) : (
                  items.map((a) => (
                    <div key={a.id} className="rounded-lg border border-border bg-card p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{formatTime(a.starts_at)}</span>
                        <StatusBadge tone={a.done ? "success" : "primary"}>
                          {activityKindLabels[a.kind]}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-xs">{a.title}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
