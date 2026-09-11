import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, CheckCheck, Flame, Sparkles } from "lucide-react";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    enabled: Boolean(user?.userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
    },
    onError: (e: Error) => toastError(e),
  });

  const unread = notifications.filter((n) => !n.read_at);
  const read = notifications.filter((n) => n.read_at);

  const iconFor = (type: string | null) => {
    if (type === "match") return Sparkles;
    if (type === "activity" || type === "calendar") return CalendarClock;
    if (type === "lead") return Flame;
    return Bell;
  };

  const renderItem = (n: (typeof notifications)[number]) => {
    const Icon = iconFor(n.type ?? null);
    const isUnread = !n.read_at;
    return (
      <li
        key={n.id}
        className={`flex items-start gap-3 px-5 py-4 text-sm transition-colors ${
          isUnread ? "bg-primary/[0.04]" : "hover:bg-surface"
        }`}
      >
        <span
          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${
            isUnread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={isUnread ? "font-semibold" : "font-medium text-muted-foreground"}>{n.title}</p>
            {isUnread ? <StatusBadge tone="primary" dot>Nou</StatusBadge> : null}
          </div>
          {n.body ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.body}</p> : null}
          <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
        </div>
        {isUnread ? (
          <Button size="sm" variant="ghost" className="shrink-0" onClick={() => markRead.mutate([n.id])}>
            Marchează citit
          </Button>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Notificări"
        description="Alerte despre lead-uri noi, activități apropiate și schimbări în portofoliu."
        meta={
          notifications.length > 0 ? (
            <>
              <StatusBadge tone={unread.length > 0 ? "primary" : "neutral"} dot>
                {unread.length} necitite
              </StatusBadge>
              <StatusBadge tone="neutral">{notifications.length} în total</StatusBadge>
            </>
          ) : undefined
        }
        actions={
          unread.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => markRead.mutate(unread.map((n) => n.id))}>
              <CheckCheck className="size-4" /> Marchează toate ca citite
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="panel overflow-hidden">
          <ListSkeleton rows={6} compact />
        </div>
      ) : notifications.length === 0 ? (
        <div className="panel overflow-hidden">
          <EmptyState icon={Bell} title="Nicio notificare" description="Ești la zi cu tot." />
        </div>
      ) : (
        <div className="space-y-6">
          {unread.length > 0 ? (
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold">Necitite</h2>
                <span className="text-xs text-muted-foreground">{unread.length}</span>
              </div>
              <ul className="divide-y divide-border">{unread.map(renderItem)}</ul>
            </section>
          ) : null}

          {read.length > 0 ? (
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold text-muted-foreground">Citite</h2>
                <span className="text-xs text-muted-foreground">{read.length}</span>
              </div>
              <ul className="divide-y divide-border">{read.map(renderItem)}</ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

