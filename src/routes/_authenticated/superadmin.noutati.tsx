/** Superadmin → Noutăți: noutăți Habitoo afișate pe Acasă la toate agențiile. */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { appHead } from "@/components/app/app-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/superadmin/noutati")({
  head: () => appHead("Habitoo CRM — noutăți Habitoo"),
  component: SuperadminNewsPage,
});

type Row = { id: string; title: string; body: string; link_url: string | null; published: boolean; published_at: string | null; created_at: string };
type Draft = { id?: string; title: string; body: string; link_url: string; published_at: string };
const KEY = ["superadmin", "habitoo-news"];
const today = () => new Date().toISOString().slice(0, 10);

function SuperadminNewsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("habitoo_news").select("id, title, body, link_url, published, published_at, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ["home", "habitoo-news"] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const title = d.title.trim();
      if (!title) throw new Error("Titlul e obligatoriu.");
      if (d.body.length > 500) throw new Error("Textul are maximum 500 de caractere.");
      const link = d.link_url.trim();
      if (link && !/^https?:\/\//.test(link)) throw new Error("Linkul trebuie să înceapă cu http:// sau https://.");
      const row = { title, body: d.body.trim(), link_url: link || null, published_at: d.published_at ? new Date(d.published_at).toISOString() : null, updated_at: new Date().toISOString() };
      const { error } = d.id ? await supabase.from("habitoo_news").update(row).eq("id", d.id) : await supabase.from("habitoo_news").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Noutatea a fost salvată."); setDraft(null); refresh(); },
    onError: (e) => toastError(e),
  });

  const toggle = useMutation({
    mutationFn: async (r: Row) => {
      const publish = !r.published;
      const { error } = await supabase.from("habitoo_news").update({ published: publish, published_at: publish ? r.published_at ?? new Date().toISOString() : r.published_at }).eq("id", r.id);
      if (error) throw error;
      return publish;
    },
    onSuccess: (p) => { toast.success(p ? "Noutatea e publicată." : "Noutatea a fost retrasă."); refresh(); },
    onError: (e) => toastError(e),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Noutăți"
        description="Noutățile publicate apar pe Acasă la toate agențiile (ultimele 3)."
        actions={<Button onClick={() => setDraft({ title: "", body: "", link_url: "", published_at: today() })}><Plus className="size-4" /> Noutate nouă</Button>}
      />
      {q.isLoading ? <InlineLoading /> : q.error ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="space-y-3">
          {(q.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nicio noutate încă.</p> : null}
          {(q.data ?? []).map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.title}</span>
                  <span className={r.published ? "rounded-full bg-success/10 px-2 py-0.5 text-xs text-success" : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"}>
                    {r.published ? "Publicată" : "Nepublicată"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.published_at ? `Data publicării: ${new Date(r.published_at).toLocaleDateString("ro-RO")}` : "Fără dată de publicare"}
                  {r.link_url ? ` · ${r.link_url}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setDraft({ id: r.id, title: r.title, body: r.body, link_url: r.link_url ?? "", published_at: r.published_at?.slice(0, 10) ?? "" })}>
                  <Pencil className="size-4" /> Editează
                </Button>
                <Button size="sm" variant={r.published ? "outline" : "default"} disabled={toggle.isPending} onClick={() => toggle.mutate(r)}>
                  {r.published ? "Retrage" : "Publică"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? "Editează noutatea" : "Noutate nouă"}</DialogTitle></DialogHeader>
          {draft ? (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
              <div className="space-y-1.5"><Label htmlFor="n-title">Titlu</Label>
                <Input id="n-title" maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="n-body">Text scurt</Label>
                <Textarea id="n-body" rows={5} maxLength={500} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <p className="text-right text-xs text-muted-foreground">{draft.body.length} / 500</p></div>
              <div className="space-y-1.5"><Label htmlFor="n-link">Link (opțional)</Label>
                <Input id="n-link" type="url" placeholder="https://" value={draft.link_url} onChange={(e) => setDraft({ ...draft, link_url: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="n-date">Data publicării</Label>
                <Input id="n-date" type="date" value={draft.published_at} onChange={(e) => setDraft({ ...draft, published_at: e.target.value })} /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>Renunță</Button>
                <Button type="submit" disabled={save.isPending}>Salvează</Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
