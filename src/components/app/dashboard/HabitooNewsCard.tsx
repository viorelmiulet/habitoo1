/** „Noutăți Habitoo” pe Acasă: ultimele 3 publicate; punct auriu pentru necitite. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type News = { id: string; title: string; body: string; link_url: string | null; published_at: string | null };

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" }) : "";

export function HabitooNewsCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["home", "habitoo-news"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: news, error } = await supabase
        .from("habitoo_news")
        .select("id, title, body, link_url, published_at")
        .eq("published", true)
        .order("published_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      const ids = (news ?? []).map((n) => n.id);
      const { data: reads } = ids.length
        ? await supabase.from("habitoo_news_reads").select("news_id").in("news_id", ids)
        : { data: [] };
      return { userId: u.user?.id ?? null, news: (news ?? []) as News[], read: new Set((reads ?? []).map((r) => r.news_id)) };
    },
  });

  async function toggle(n: News) {
    setOpen((cur) => (cur === n.id ? null : n.id));
    if (!data?.userId || data.read.has(n.id)) return;
    await supabase.from("habitoo_news_reads").upsert({ user_id: data.userId, news_id: n.id }, { ignoreDuplicates: true });
    qc.invalidateQueries({ queryKey: ["home", "habitoo-news"] });
  }

  const news = data?.news ?? [];
  return (
    <section className={className}>
      <div className="mb-4 flex items-center gap-2 text-base font-semibold">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold-tint text-gold-dark">
          <Megaphone className="size-4" aria-hidden />
        </span>
        <h2 className="truncate">Noutăți Habitoo</h2>
      </div>
      {news.length === 0 ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
            <Megaphone className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-medium">Nicio noutate momentan.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {news.map((n) => {
            const unread = !data?.read.has(n.id);
            const isOpen = open === n.id;
            return (
              <li key={n.id} className="rounded-xl border border-border">
                <button type="button" onClick={() => void toggle(n)} aria-expanded={isOpen} className="flex w-full items-start gap-2 p-3 text-left">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", unread ? "bg-gold" : "bg-transparent")} aria-label={unread ? "Necitită" : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", unread ? "font-semibold" : "font-medium")}>{n.title}</span>
                    <span className="block text-xs text-muted-foreground">{fmt(n.published_at)}</span>
                    {isOpen ? null : <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>}
                  </span>
                </button>
                {isOpen ? (
                  <div className="px-3 pb-3 pl-7 text-sm">
                    <p className="whitespace-pre-line text-muted-foreground">{n.body}</p>
                    {n.link_url ? (
                      <a href={n.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline">
                        Află mai multe <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
