import { createFileRoute, Link } from "@tanstack/react-router";
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
import { appHead } from "@/components/app/app-head";
import { safeInternalPath } from "@/lib/host";

export const Route = createFileRoute("/_authenticated/app/notifications")({
  head: () => { const title = "Habitoo CRM — notificări"; const description = "Alertele utilizatorului despre lead-uri, activități și evenimentele din CRM."; const head = appHead(title); return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
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
        .or("type.is.null,type.neq.portal_publish_done")
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
        data-tour="notification-item"
        key={n.id}
        className={`relative flex min-h-[52px] flex-wrap items-start gap-3 px-4 py-3 text-sm transition-colors sm:flex-nowrap sm:px-5 ${
          isUnread ? "bg-gold-tint/50" : "hover:bg-muted"
        }`}
      >
        {isUnread ? <span aria-hidden className="absolute left-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-gold sm:left-2" /> : null}
        <span
          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${
            isUnread ? "bg-gold-tint text-gold-dark" : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={isUnread ? "font-semibold" : "font-semibold text-muted-foreground"}>
              {safeInternalPath(n.link) ? <Link to={safeInternalPath(n.link) ?? "/app/notifications"} className="hover:underline">{n.title}</Link> : n.title}
            </p>
            {isUnread ? (
              <StatusBadge tone="primary" dot>
                Nou
              </StatusBadge>
            ) : null}
          </div>
          {n.body ? (
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{n.body}</p>
          ) : null}
          <p className="mt-1 text-[13px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
        </div>
        {isUnread ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-11 shrink-0 max-sm:ml-12 max-sm:w-[calc(100%-3rem)] sm:h-10"
            onClick={() => markRead.mutate([n.id])}
          >
            Marchează citit
          </Button>
        ) : null}
      </li>
    );
  };

  return (
    <div data-tour="notifications-page">
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
            <Button
              data-tour="notifications-read-all"
              size="sm"
              variant="link"
              className="h-11 px-0 text-sm font-semibold text-gold-dark"
              onClick={() => markRead.mutate(unread.map((n) => n.id))}
            >
              <CheckCheck className="size-4" /> Marchează toate ca citite
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <ListSkeleton rows={6} compact />
        </div>
      ) : notifications.length === 0 ? (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <EmptyState icon={Bell} title="Nicio notificare" description="Ești la zi cu tot." />
        </div>
      ) : (
        <div className="space-y-6">
          {unread.length > 0 ? (
            <section className="overflow-hidden rounded-[14px] border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3.5 sm:px-5">
                <h2 className="text-base font-bold">Necitite</h2>
                <span className="text-[13px] text-muted-foreground">{unread.length}</span>
              </div>
              <ul className="divide-y divide-border">{unread.map(renderItem)}</ul>
            </section>
          ) : null}

          {read.length > 0 ? (
            <section className="overflow-hidden rounded-[14px] border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3.5 sm:px-5">
                <h2 className="text-base font-bold text-muted-foreground">Citite</h2>
                <span className="text-[13px] text-muted-foreground">{read.length}</span>
              </div>
              <ul className="divide-y divide-border">{read.map(renderItem)}</ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
