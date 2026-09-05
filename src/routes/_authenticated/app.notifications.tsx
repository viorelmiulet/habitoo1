import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
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
    onError: (e: Error) => toast.error(e.message),
  });

  const unread = notifications.filter((n) => !n.read_at);

  return (
    <>
      <PageHeader
        title="Notificări"
        description="Alerte despre lead-uri noi, activități apropiate și schimbări în portofoliu."
        actions={
          unread.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => markRead.mutate(unread.map((n) => n.id))}>
              <CheckCheck className="size-4" /> Marchează toate ca citite
            </Button>
          ) : undefined
        }
      />

      <div className="panel overflow-hidden">
        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Se încarcă…</p>
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} title="Nicio notificare" description="Ești la zi cu tot." />
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`flex flex-wrap items-center gap-3 px-5 py-4 text-sm ${
                  n.read_at ? "" : "bg-primary/5"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title}</p>
                  {n.body ? <p className="text-xs text-muted-foreground">{n.body}</p> : null}
                </div>
                {n.read_at ? null : <StatusBadge tone="primary">Nou</StatusBadge>}
                <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
                {n.read_at ? null : (
                  <Button size="sm" variant="ghost" onClick={() => markRead.mutate([n.id])}>
                    Marchează citit
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
