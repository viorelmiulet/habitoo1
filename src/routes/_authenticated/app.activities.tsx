import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/app/activities")({
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === true || search.new === "true" ? true : undefined,
  }),
  component: ActivitiesPage,
});

function ActivitiesPage() {
  const { new: openNew } = Route.useSearch();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(Boolean(openNew));
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");

  const { data, isLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: async () => {
      const [activities, properties, contacts] = await Promise.all([
        supabase.from("activities").select("*").order("starts_at", { ascending: true }),
        supabase.from("properties").select("id,title"),
        supabase.from("contacts").select("id,first_name,last_name"),
      ]);
      if (activities.error) throw activities.error;
      return {
        activities: activities.data,
        properties: properties.data ?? [],
        contacts: contacts.data ?? [],
      };
    },
  });

  const [form, setForm] = useState({
    title: "",
    kind: "call",
    starts_at: new Date(Date.now() + 3600_000).toISOString().slice(0, 16),
    property_id: "",
    contact_id: "",
    description: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      const { error } = await supabase.from("activities").insert({
        organization_id: user.organization.id,
        assigned_to: user.userId,
        created_by: user.userId,
        title: form.title,
        kind: form.kind as never,
        starts_at: new Date(form.starts_at).toISOString(),
        property_id: form.property_id || null,
        contact_id: form.contact_id || null,
        description: form.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      setOpen(false);
      toast.success("Activitatea a fost programată.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDone = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("activities").update({ done }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["activities"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data?.activities ?? []).filter((a) =>
    filter === "all" ? true : filter === "done" ? a.done : !a.done,
  );

  return (
    <>
      <PageHeader
        title="Activități"
        description="Apeluri, întâlniri, vizionări și task-uri, cu bifare rapidă."
        actions={
          <>
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">De făcut</SelectItem>
                <SelectItem value="done">Finalizate</SelectItem>
                <SelectItem value="all">Toate</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setOpen(true)}>
              Adaugă activitate
            </Button>
          </>
        }
      />

      <div className="panel overflow-hidden">
        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Se încarcă…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nicio activitate"
            description="Programează un apel sau o vizionare pentru a începe."
            action={
              <Button size="sm" onClick={() => setOpen(true)}>
                Adaugă activitate
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Checkbox
                  checked={a.done}
                  onCheckedChange={(c) => toggleDone.mutate({ id: a.id, done: Boolean(c) })}
                />
                <StatusBadge tone={a.done ? "success" : "primary"}>
                  {activityKindLabels[a.kind]}
                </StatusBadge>
                <div className="min-w-0 flex-1">
                  <p className={a.done ? "truncate text-muted-foreground line-through" : "truncate font-medium"}>
                    {a.title}
                  </p>
                  {a.description ? (
                    <p className="truncate text-xs text-muted-foreground">{a.description}</p>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activitate nouă</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="title">Titlu</Label>
              <Input
                id="title"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tip</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(activityKindLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="starts_at">Data și ora</Label>
                <Input
                  id="starts_at"
                  type="datetime-local"
                  required
                  value={form.starts_at}
                  onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Proprietate</Label>
                <Select
                  value={form.property_id || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, property_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opțional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără proprietate</SelectItem>
                    {(data?.properties ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contact</Label>
                <Select
                  value={form.contact_id || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, contact_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opțional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără contact</SelectItem>
                    {(data?.contacts ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Detalii</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Renunță
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Programează
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
