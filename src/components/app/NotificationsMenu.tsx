import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, CheckCheck, Sparkles, Target, UserPlus, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/lib/errors";
import { safeInternalPath } from "@/lib/host";
import { cn } from "@/lib/utils";

const typeIcon: Record<string, LucideIcon> = {
  lead: UserPlus,
  match: Sparkles,
  activity: CalendarClock,
  followup: CalendarClock,
  goal: Target,
};

function relativeShort(value: string) {
  const diffMin = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (diffMin < 1) return "acum";
  if (diffMin < 60) return `${diffMin} min`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ieri";
  if (d < 7) return `${d} zile`;
  return new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short" }).format(new Date(value));
}

/**
 * Clopoțel cu popover: ultimele notificări, marcare citit, link către pagina completă.
 * Cheile de query sunt prefixate cu ["notifications"] pentru invalidare comună.
 */
export function NotificationsMenu({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const unread = useQuery({
    queryKey: ["notifications", "unread-count", userId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const recent = useQuery({
    queryKey: ["notifications", "recent", userId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, type, link, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[] | "all") => {
      let q = supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
      if (ids !== "all") q = q.in("id", ids);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e) => toastError(e, "Nu am putut marca notificarea ca citită."),
  });

  const count = unread.data ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={count > 0 ? `Notificări, ${count} necitite` : "Notificări"}
        >
          <Bell className="size-[18px]" />
          {count > 0 ? (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-destructive-foreground ring-2 ring-card">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notificări</p>
          {count > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate("all")}
            >
              <CheckCheck className="size-3.5" /> Toate citite
            </Button>
          ) : null}
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto">
          {recent.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : recent.isError ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nu am putut încărca notificările.
            </p>
          ) : !recent.data?.length ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Bell className="size-5" />
              </span>
              <p className="text-sm font-medium">Ești la zi</p>
              <p className="text-xs text-muted-foreground">Nu ai notificări noi.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.data.map((n) => {
                const Icon = typeIcon[n.type] ?? Bell;
                const href = safeInternalPath(n.link);
                const isUnread = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                        isUnread && "bg-primary/[0.04]",
                      )}
                      onClick={() => {
                        if (isUnread) markRead.mutate([n.id]);
                        setOpen(false);
                        if (href) navigate({ to: href });
                      }}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          isUnread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={cn("line-clamp-1 text-sm", isUnread ? "font-semibold" : "font-medium")}>
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {relativeShort(n.created_at)}
                          </span>
                        </span>
                        {n.body ? (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>
                        ) : null}
                      </span>
                      {isUnread ? (
                        <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-2">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center text-xs">
            <Link to="/app/notifications" onClick={() => setOpen(false)}>
              Vezi toate notificările
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
