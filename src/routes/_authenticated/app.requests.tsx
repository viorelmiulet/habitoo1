import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Bookmark, Download, Search, Sparkles, Target, X } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { PromptDialog, type PromptRequest } from "@/components/app/PromptDialog";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useSavedViews } from "@/hooks/use-saved-views";
import { formatMoney, relativeDays } from "@/lib/format";
import { propertyTypeLabels, requestKindLabels } from "@/lib/labels";
import { matchTone, scoreMatch } from "@/lib/matching";
import {
  downloadCsv,
  requestStatusLabels,
  requestStatusOptions,
  requestStatusTone,
} from "@/lib/crm";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/app/requests")({
  head: () => appHead("Habitoo CRM — cereri"),
  validateSearch: (search: Record<string, unknown>): { new?: boolean } =>
    search["new"] === true || search["new"] === "true" ? { new: true } : {},
  component: RequestsPage,
});

const PAGE_SIZE = 25;

const priorityLabels: Record<string, string> = {
  low: "Scăzută",
  medium: "Medie",
  high: "Ridicată",
};
const priorityTone: Record<string, "neutral" | "info" | "warning"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
};

type Filters = {
  q: string;
  kind: string;
  status: string;
  priority: string;
  assigned: string;
  city: string;
};

const emptyFilters: Filters = {
  q: "",
  kind: "all",
  status: "all",
  priority: "all",
  assigned: "all",
  city: "all",
};

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function RequestsPage() {
  const { new: openNew } = Route.useSearch();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const debouncedQ = useDebounced(filters.q);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(Boolean(openNew));
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  const { views, save, remove } = useSavedViews("requests", user?.organization?.id, user?.userId);

  useEffect(
    () => setPage(0),
    [debouncedQ, filters.kind, filters.status, filters.priority, filters.assigned, filters.city],
  );

  const { data: agents = [] } = useQuery({
    queryKey: ["profiles-agents", user?.organization?.id],
    enabled: Boolean(user?.organization?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("organization_id", user!.organization!.id)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-simple", user?.organization?.id],
    enabled: Boolean(user?.organization?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id,first_name,last_name")
        .eq("organization_id", user!.organization!.id);
      if (error) throw error;
      return data;
    },
  });

  const { data: allRequests = [] } = useQuery({
    queryKey: ["requests-meta", user?.organization?.id],
    enabled: Boolean(user?.organization?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("cities")
        .eq("organization_id", user!.organization!.id);
      if (error) throw error;
      return data;
    },
  });
  const cities = useMemo(
    () => [...new Set(allRequests.flatMap((r) => r.cities ?? []))].sort(),
    [allRequests],
  );

  const { data: properties = [] } = useQuery({
    queryKey: ["properties-active", user?.organization?.id],
    enabled: Boolean(user?.organization?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("organization_id", user!.organization!.id)
        .in("status", ["active", "reserved"]);
      if (error) throw error;
      return data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["requests", user?.organization?.id, filters, debouncedQ, page],
    enabled: Boolean(user?.organization?.id),
    queryFn: async () => {
      let query = supabase
        .from("requests")
        .select("*", { count: "exact" })
        .eq("organization_id", user!.organization!.id);
      if (filters.kind !== "all") query = query.eq("kind", filters.kind as never);
      if (filters.status !== "all") query = query.eq("status", filters.status);
      if (filters.priority !== "all") query = query.eq("priority", filters.priority);
      if (filters.assigned !== "all") query = query.eq("assigned_to", filters.assigned);
      if (filters.city !== "all") query = query.contains("cities", [filters.city]);
      if (debouncedQ.trim()) query = query.ilike("title", `%${debouncedQ.trim()}%`);
      query = query
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.full_name ?? "—";

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
    floor_preference: "",
    furnished: false,
    wants_parking: false,
    wants_balcony: false,
    features: "",
    priority: "medium",
    term: "",
    assigned_to: "",
    source: "",
    status: "new",
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
        assigned_to: form.assigned_to || user.userId,
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
        floor_preference: form.floor_preference || null,
        furnished: form.furnished,
        wants_parking: form.wants_parking,
        wants_balcony: form.wants_balcony,
        features: list(form.features),
        priority: form.priority,
        term: form.term || null,
        source: form.source || null,
        notes: form.notes || null,
        status: form.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      setOpen(false);
      toast.success("Cererea a fost adăugată.");
    },
    onError: (e: Error) => toastError(e),
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase.from("requests").update({ status: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requests"] }),
    onError: (e: Error) => toastError(e),
  });

  const bulkUpdate = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("requests")
        .update(patch as never)
        .in("id", selected);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      setSelected([]);
      toast.success("Cererile au fost actualizate.");
    },
    onError: (e: Error) => toastError(e),
  });

  const allSelected = rows.length > 0 && selected.length === rows.length;
  const bestMatchCount = (request: (typeof rows)[number]) =>
    properties.filter((p) => scoreMatch(request, p).score >= 70).length;

  const exportCsv = () => {
    downloadCsv(
      "cereri.csv",
      rows.map((r) => ({
        Titlu: r.title,
        Tip: requestKindLabels[r.kind] ?? r.kind,
        Status: requestStatusLabels[r.status] ?? r.status,
        Prioritate: r.priority,
        BugetMin: r.budget_min ?? "",
        BugetMax: r.budget_max ?? "",
        Orase: (r.cities ?? []).join("; "),
      })),
    );
  };

  const saveFilter = () => {
    setPromptRequest({
      title: "Salvează filtrul curent",
      description: "Filtrele active vor fi salvate sub un nume, pentru a le reaplica rapid.",
      label: "Numele filtrului",
      placeholder: "ex. Cereri închiriere, buget < 700 €",
      confirmLabel: "Salvează",
      onSubmit: (name) => save.mutateAsync({ name, config: filters }),
    });
  };

  return (
    <>
      <PageHeader
        title="Cereri clienți"
        description="Criteriile de căutare ale clienților, folosite pentru matching automat cu portofoliul."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              Adaugă cerere
            </Button>
          </>
        }
      />

      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Caută după titlu…"
              className="pl-9"
            />
          </div>
          <Select
            value={filters.kind}
            onValueChange={(v) => setFilters((f) => ({ ...f, kind: v }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tip cerere" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate tipurile</SelectItem>
              {Object.entries(requestKindLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.status}
            onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate statusurile</SelectItem>
              {requestStatusOptions.map((k) => (
                <SelectItem key={k} value={k}>
                  {requestStatusLabels[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.priority}
            onValueChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Prioritate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              <SelectItem value="low">Scăzută</SelectItem>
              <SelectItem value="medium">Medie</SelectItem>
              <SelectItem value="high">Ridicată</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.assigned}
            onValueChange={(v) => setFilters((f) => ({ ...f, assigned: v }))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toți agenții</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.city}
            onValueChange={(v) => setFilters((f) => ({ ...f, city: v }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Oraș" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate orașele</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={saveFilter}>
            <Bookmark className="size-4" /> Salvează filtrul
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
            <X className="size-4" /> Resetează
          </Button>
        </div>

        {views.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Filtre salvate:</span>
            {views.map((v) => (
              <Button
                key={v.id}
                variant="secondary"
                size="sm"
                onClick={() => setFilters({ ...emptyFilters, ...(v.config as Partial<Filters>) })}
                onDoubleClick={() => remove.mutate(v.id)}
                title="Dublu-click pentru a șterge"
              >
                {v.name}
              </Button>
            ))}
          </div>
        ) : null}

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="text-sm font-medium">{selected.length} selectate</span>
            <Select onValueChange={(v) => bulkUpdate.mutate({ status: v })}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Schimbă statusul" />
              </SelectTrigger>
              <SelectContent>
                {requestStatusOptions.map((k) => (
                  <SelectItem key={k} value={k}>
                    {requestStatusLabels[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => bulkUpdate.mutate({ assigned_to: v })}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Asignează agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
          </div>
        ) : null}
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <ListSkeleton rows={8} />
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
            <li className="flex items-center gap-3 bg-surface px-5 py-2.5 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])}
              />
              <span>Selectează tot</span>
              <span className="ml-auto">{total} cereri</span>
            </li>
            {rows.map((r) => {
              const matches = bestMatchCount(r);
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm transition-colors hover:bg-surface"
                >
                  <Checkbox
                    checked={selected.includes(r.id)}
                    onCheckedChange={(v) =>
                      setSelected((s) => (v ? [...s, r.id] : s.filter((id) => id !== r.id)))
                    }
                  />
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Target className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/app/requests/$id"
                        params={{ id: r.id }}
                        className="truncate font-medium hover:text-primary"
                      >
                        {r.title}
                      </Link>
                      <StatusBadge tone={priorityTone[r.priority] ?? "neutral"} dot>
                        {priorityLabels[r.priority] ?? r.priority}
                      </StatusBadge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {requestKindLabels[r.kind]} ·{" "}
                      {propertyTypeLabels[r.property_type ?? ""] ?? "orice tip"} ·{" "}
                      {(r.cities ?? []).join(", ") || "orice oraș"} · {agentName(r.assigned_to)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {formatMoney(r.budget_max, r.currency)}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      de la {formatMoney(r.budget_min, r.currency)}
                    </p>
                  </div>
                  <StatusBadge tone={matchTone(matches > 0 ? 80 : 40)}>
                    <Sparkles className="size-3" /> {matches} potriviri
                  </StatusBadge>
                  <Select
                    value={r.status}
                    onValueChange={(v) => setStatusMutation.mutate({ id: r.id, value: v })}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {requestStatusOptions.map((k) => (
                        <SelectItem key={k} value={k}>
                          {requestStatusLabels[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {relativeDays(r.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} din {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Următor
            </Button>
          </div>
        </div>
      ) : null}

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
                <Select
                  value={form.kind}
                  onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}
                >
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
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, contact_id: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează contact" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără contact</SelectItem>
                    {contacts.map((c) => (
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
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}
                >
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
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {requestStatusOptions.map((k) => (
                      <SelectItem key={k} value={k}>
                        {requestStatusLabels[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Agent</Label>
                <Select
                  value={form.assigned_to || "me"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, assigned_to: v === "me" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="me">Eu</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.full_name}
                      </SelectItem>
                    ))}
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
              <div className="space-y-2">
                <Label htmlFor="floor_preference">Etaj preferat</Label>
                <Input
                  id="floor_preference"
                  value={form.floor_preference}
                  onChange={(e) => setForm((f) => ({ ...f, floor_preference: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="term">Termen</Label>
                <Input
                  id="term"
                  value={form.term}
                  onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))}
                  placeholder="Ex: urgent, 3 luni"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Sursă</Label>
                <Input
                  id="source"
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="features">Facilități (separate prin virgulă)</Label>
                <Input
                  id="features"
                  value={form.features}
                  onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.furnished}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, furnished: Boolean(v) }))}
                />{" "}
                Mobilat
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.wants_parking}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, wants_parking: Boolean(v) }))}
                />{" "}
                Parcare
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.wants_balcony}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, wants_balcony: Boolean(v) }))}
                />{" "}
                Balcon
              </label>
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

      <PromptDialog request={promptRequest} onClose={() => setPromptRequest(null)} />
    </>
  );
}
