import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { formatMoney, relativeDays } from "@/lib/format";
import { propertyTypeLabels, requestKindLabels } from "@/lib/labels";
import { matchTone, scoreMatch } from "@/lib/matching";

export const Route = createFileRoute("/_authenticated/app/requests")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } =>
    search["new"] === true || search["new"] === "true" ? { new: true } : {},
  component: RequestsPage,
});

const statusLabels: Record<string, string> = {
  active: "Activă",
  paused: "În așteptare",
  closed: "Închisă",
};

function RequestsPage() {
  const { new: openNew } = Route.useSearch();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(Boolean(openNew));

  const { data, isLoading } = useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const [requests, properties, contacts] = await Promise.all([
        supabase.from("requests").select("*").order("created_at", { ascending: false }),
        supabase.from("properties").select("*").in("status", ["active", "reserved"]),
        supabase.from("contacts").select("id,first_name,last_name"),
      ]);
      if (requests.error) throw requests.error;
      return {
        requests: requests.data,
        properties: properties.data ?? [],
        contacts: contacts.data ?? [],
      };
    },
  });

  const [form, setForm] = useState({
    title: "",
    kind: "buy",
    contact_id: "",
    property_type: "apartment",
    budget_min: "",
    budget_max: "",
    currency: "EUR",
    cities: "",
    areas: "",
    rooms_min: "",
    rooms_max: "",
    surface_min: "",
    priority: "medium",
    notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const list = (v: string) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const { error } = await supabase.from("requests").insert({
        organization_id: user.organization.id,
        assigned_to: user.userId,
        created_by: user.userId,
        title: form.title,
        kind: form.kind as never,
        contact_id: form.contact_id || null,
        property_type: form.property_type,
        budget_min: num(form.budget_min),
        budget_max: num(form.budget_max),
        currency: form.currency,
        cities: list(form.cities),
        areas: list(form.areas),
        rooms_min: num(form.rooms_min),
        rooms_max: num(form.rooms_max),
        surface_min: num(form.surface_min),
        priority: form.priority,
        notes: form.notes || null,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      setOpen(false);
      toast.success("Cererea a fost adăugată.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase.from("requests").update({ status: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requests"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.requests ?? []).filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!term) return true;
      return [r.title, ...(r.cities ?? []), ...(r.areas ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [data?.requests, q, status]);

  const bestMatchCount = (request: (typeof rows)[number]) =>
    (data?.properties ?? []).filter((p) => scoreMatch(request, p).score >= 70).length;

  return (
    <>
      <PageHeader
        title="Cereri clienți"
        description="Criteriile de căutare ale clienților, folosite pentru matching automat cu portofoliul."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            Adaugă cerere
          </Button>
        }
      />

      <div className="panel flex flex-wrap items-center gap-2 p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută după titlu sau zonă…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate statusurile</SelectItem>
            {Object.entries(statusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Se încarcă…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Nicio cerere"
            description="Adaugă o cerere pentru a primi potriviri automate."
            action={
              <Button size="sm" onClick={() => setOpen(true)}>
                Adaugă cerere
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const matches = bestMatchCount(r);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {requestKindLabels[r.kind]} ·{" "}
                      {propertyTypeLabels[r.property_type ?? ""] ?? "orice tip"} ·{" "}
                      {(r.cities ?? []).join(", ") || "orice oraș"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(r.budget_min, r.currency)} – {formatMoney(r.budget_max, r.currency)}
                  </span>
                  <StatusBadge tone={matchTone(matches > 0 ? 80 : 40)}>
                    <Sparkles className="size-3" /> {matches} potriviri
                  </StatusBadge>
                  <Select value={r.status} onValueChange={(v) => setStatusMutation.mutate({ id: r.id, value: v })}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {relativeDays(r.created_at)}
                  </span>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/app/matching">Potriviri</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cerere nouă</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="title">Titlu cerere</Label>
              <Input
                id="title"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Familie caută 3 camere, Nord"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tip cerere</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(requestKindLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Client</Label>
                <Select
                  value={form.contact_id || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, contact_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează contact" />
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
              <div className="space-y-2">
                <Label>Tip proprietate</Label>
                <Select
                  value={form.property_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, property_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(propertyTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioritate</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Scăzută</SelectItem>
                    <SelectItem value="medium">Medie</SelectItem>
                    <SelectItem value="high">Ridicată</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget_min">Buget minim</Label>
                <Input
                  id="budget_min"
                  type="number"
                  value={form.budget_min}
                  onChange={(e) => setForm((f) => ({ ...f, budget_min: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget_max">Buget maxim</Label>
                <Input
                  id="budget_max"
                  type="number"
                  value={form.budget_max}
                  onChange={(e) => setForm((f) => ({ ...f, budget_max: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cities">Orașe (separate prin virgulă)</Label>
                <Input
                  id="cities"
                  value={form.cities}
                  onChange={(e) => setForm((f) => ({ ...f, cities: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="areas">Zone preferate</Label>
                <Input
                  id="areas"
                  value={form.areas}
                  onChange={(e) => setForm((f) => ({ ...f, areas: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rooms_min">Camere minim</Label>
                <Input
                  id="rooms_min"
                  type="number"
                  value={form.rooms_min}
                  onChange={(e) => setForm((f) => ({ ...f, rooms_min: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rooms_max">Camere maxim</Label>
                <Input
                  id="rooms_max"
                  type="number"
                  value={form.rooms_max}
                  onChange={(e) => setForm((f) => ({ ...f, rooms_max: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surface_min">Suprafață minimă (m²)</Label>
                <Input
                  id="surface_min"
                  type="number"
                  value={form.surface_min}
                  onChange={(e) => setForm((f) => ({ ...f, surface_min: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Note</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Renunță
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Salvează cererea
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
