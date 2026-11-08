import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const fmt = (v: string) => new Date(v).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });

/** „Postări în grupuri Facebook” — notate de extensia Chrome; vizibile doar în CRM. */
export function PropertyFacebookPosts({ propertyId }: { propertyId: string }) {
  const q = useQuery({
    queryKey: ["facebook-group-posts", propertyId],
    queryFn: async () => {
      const { data } = await supabase.from("facebook_group_posts").select("id,group_name,group_url,posted_at,user_id").eq("property_id", propertyId).order("posted_at", { ascending: false }).limit(50);
      const rows = data ?? [];
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
      const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
      return rows.map((r) => ({ ...r, agent: names.get(r.user_id) ?? "—" }));
    },
  });
  if (!q.data?.length) return null;
  return (
    <section className="panel px-5 py-[18px]">
      <h2 className="font-sans text-base font-bold">Postări în grupuri Facebook</h2>
      <ul className="mt-3 space-y-3">
        {q.data.map((r) => (
          <li key={r.id} className="text-sm">
            {/^https:\/\//i.test(r.group_url) ? <a href={r.group_url} target="_blank" rel="noreferrer noopener" className="font-medium hover:text-primary">{r.group_name || r.group_url}</a> : <span className="font-medium">{r.group_name || r.group_url}</span>}
            <p className="text-xs text-muted-foreground">{r.agent} · {fmt(r.posted_at)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
