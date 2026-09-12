import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Download,
  LayoutGrid,
  List,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { PromptDialog, type PromptRequest } from "@/components/app/PromptDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { relativeDays } from "@/lib/format";
import { contactTypeLabels } from "@/lib/labels";
import { downloadCsv } from "@/lib/crm";
import { UserAvatar } from "@/components/app/UserAvatar";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/app/contacts/")({
  head: () => appHead("Habitoo CRM — contacte"),
  validateSearch: (search: Record<string, unknown>): { new?: boolean } =>
    search["new"] === true || search["new"] === "true" ? { new: true } : {},
  component: ContactsPage,
});

const PAGE_SIZE = 25;

const statusLabels: Record<string, string> = {
  active: "Activ",
  inactive: "Inactiv",
};

type Filters = {
  q: string;
  type: string;
  source: string;
  assigned: string;
  status: string;
  mine: boolean;
  tag: string;
};

const emptyFilters: Filters = {
  q: "",
  type: "all",
  source: "all",
  assigned: "all",
  status: "all",
  mine: false,
  tag: "all",
};

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ContactsPage() {
  const { new: openNew } = Route.useSearch();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const debouncedQ = useDebounced(filters.q);
  const [view, setView] = useState<"list" | "card">("list");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(Boolean(openNew));
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);

  const { views, save, remove } = useSavedViews("contacts", user?.organization?.id, user?.userId);

  useEffect(() => {
    setPage(0);
  }, [
    debouncedQ,
    filters.type,
    filters.source,
    filters.assigned,
    filters.status,
    filters.mine,
    filters.tag,
  ]);

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

  const { data: metaContacts = [] } = useQuery({
    queryKey: ["contacts-meta", user?.organization?.id],
    enabled: Boolean(user?.organization?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("source,tags")
        .eq("organization_id", user!.organization!.id);
      if (error) throw error;
      return data;
    },
  });

  /** Doar pentru afișare: câte lead-uri are fiecare contact. RLS decide ce se vede. */
  const { data: leadCounts } = useQuery({
    queryKey: ["contacts-lead-counts", user?.organization?.id],
    enabled: Boolean(user?.organization?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("contact_id")
        .eq("organization_id", user!.organization!.id);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of data) {
        if (!row.contact_id) continue;
        map.set(row.contact_id, (map.get(row.contact_id) ?? 0) + 1);
      }
      return map;
    },
  });

  const sources = useMemo(
    () => [...new Set(metaContacts.map((c) => c.source).filter(Boolean) as string[])].sort(),
    [metaContacts],
  );
  const tags = useMemo(
    () => [...new Set(metaContacts.flatMap((c) => c.tags ?? []))].sort(),
    [metaContacts],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", user?.organization?.id, filters, debouncedQ, page],
    enabled: Boolean(user?.organization?.id),
    queryFn: async () => {
      let query = supabase
        .from("contacts")
        .select("*", { count: "exact" })
        .eq("organization_id", user!.organization!.id);
      if (filters.type !== "all") query = query.eq("type", filters.type as never);
      if (filters.source !== "all") query = query.eq("source", filters.source);
      if (filters.assigned !== "all") query = query.eq("assigned_to", filters.assigned);
      if (filters.status !== "all") query = query.eq("status", filters.status);
      if (filters.mine) query = query.eq("assigned_to", user!.userId);
      if (filters.tag !== "all") query = query.contains("tags", [filters.tag]);
      if (debouncedQ.trim()) {
        const term = debouncedQ.trim();
        query = query.or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`,
        );
      }
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
    first_name: "",
    last_name: "",
    type: "buyer",
    phone: "",
    email: "",
    company: "",
    source: "",
    notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      const { error } = await supabase.from("contacts").insert({
        organization_id: user.organization.id,
        assigned_to: user.userId,
        created_by: user.userId,
        first_name: form.first_name,
        last_name: form.last_name,
        type: form.type as never,
        phone: form.phone || null,
        email: form.email || null,
        company: form.company || null,
        source: form.source || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setDialogOpen(false);
      setForm({
        first_name: "",
        last_name: "",
        type: "buyer",
        phone: "",
        email: "",
        company: "",
        source: "",
        notes: "",
      });
      toast.success("Contactul a fost adăugat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const bulkUpdate = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("contacts")
        .update(patch as never)
        .in("id", selected);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setSelected([]);
      toast.success("Contactele au fost actualizate.");
    },
    onError: (e: Error) => toastError(e),
  });

  const bulkAddTag = (tag: string) => {
    const targets = rows.filter((r) => selected.includes(r.id));
    void Promise.all(
      targets.map((r) =>
        supabase
          .from("contacts")
          .update({ tags: [...new Set([...(r.tags ?? []), tag])] } as never)
          .eq("id", r.id),
      ),
    ).then(() => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setSelected([]);
      toast.success("Etichetă adăugată.");
    });
  };

  const allSelected = rows.length > 0 && selected.length === rows.length;

  const exportCsv = () => {
    downloadCsv(
      "contacte.csv",
      rows.map((c) => ({
        Prenume: c.first_name,
        Nume: c.last_name,
        Tip: contactTypeLabels[c.type] ?? c.type,
        Telefon: c.phone ?? "",
        Email: c.email ?? "",
        Companie: c.company ?? "",
        Sursă: c.source ?? "",
        Status: statusLabels[c.status] ?? c.status,
      })),
    );
  };

  const saveFilter = () => {
    setPromptRequest({
      title: "Salvează filtrul curent",
      description: "Filtrele active vor fi salvate sub un nume, pentru a le reaplica rapid.",
      label: "Numele filtrului",
      placeholder: "ex. Proprietari activi, București",
      confirmLabel: "Salvează",
      onSubmit: (name) => save.mutateAsync({ name, config: filters }),
    });
  };

  return (
    <>
      <PageHeader
        title="Contacte"
        description="Toți clienții, proprietarii și partenerii agenției, într-o singură bază."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              Adaugă contact
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
              placeholder="Caută nume, telefon, email, companie…"
              className="pl-9"
            />
          </div>
          <Select
            value={filters.type}
            onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Tip contact" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate tipurile</SelectItem>
              {Object.entries(contactTypeLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.source}
            onValueChange={(v) => setFilters((f) => ({ ...f, source: v }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sursă" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate sursele</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.assigned}
            onValueChange={(v) => setFilters((f) => ({ ...f, assigned: v }))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Agent responsabil" />
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
            value={filters.status}
            onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          >
            <SelectTrigger className="w-36">
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
          <Select value={filters.tag} onValueChange={(v) => setFilters((f) => ({ ...f, tag: v }))}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Etichetă" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate etichetele</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={filters.mine ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
          >
            Doar ale mele
          </Button>
          <Button variant="ghost" size="sm" onClick={saveFilter}>
            <Bookmark className="size-4" /> Salvează filtrul
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
            <X className="size-4" /> Resetează
          </Button>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border p-0.5">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="size-8"
              aria-label="Vizualizare listă"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List className="size-4" />
            </Button>
            <Button
              variant={view === "card" ? "secondary" : "ghost"}
              size="icon"
              className="size-8"
              aria-label="Vizualizare carduri"
              aria-pressed={view === "card"}
              onClick={() => setView("card")}
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
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
            <Select onValueChange={(v) => bulkUpdate.mutate({ status: v })}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Schimbă status" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPromptRequest({
                  title: "Adaugă etichetă",
                  description: `Eticheta va fi adăugată la ${selected.length} ${selected.length === 1 ? "contact" : "contacte"}.`,
                  label: "Etichetă",
                  placeholder: "ex. investitor",
                  confirmLabel: "Adaugă",
                  onSubmit: (tag) => bulkAddTag(tag),
                })
              }
            >
              Adaugă etichetă
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDeactivate(true)}>
              <Trash2 className="size-4" /> Dezactivează
            </Button>
          </div>
        ) : null}
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <ListSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="Niciun contact"
            description="Adaugă primul contact sau ajustează filtrele."
            action={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                Adaugă contact
              </Button>
            }
          />
        ) : view === "list" ? (
          <ul className="divide-y divide-border/70">
            <li className="flex items-center gap-3 px-5 py-2.5 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])}
              />
              <span>Selectează tot</span>
            </li>
            {rows.map((c) => {
              const leads = leadCounts?.get(c.id) ?? 0;
              const fullName = `${c.first_name} ${c.last_name}`.trim();
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4 text-sm">
                  <Checkbox
                    checked={selected.includes(c.id)}
                    onCheckedChange={(v) =>
                      setSelected((s) => (v ? [...s, c.id] : s.filter((id) => id !== c.id)))
                    }
                  />
                  <UserAvatar name={fullName} className="size-10 text-sm" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/app/contacts/$id"
                      params={{ id: c.id }}
                      className="truncate font-medium hover:text-primary"
                    >
                      {fullName}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{contactTypeLabels[c.type] ?? c.type}</span>
                      {c.company || c.source ? <span>· {c.company || c.source}</span> : null}
                      <span>· adăugat {relativeDays(c.created_at)}</span>
                    </p>
                  </div>
                  <span className="w-40 text-xs text-muted-foreground">{c.phone ?? "—"}</span>
                  <span className="w-56 truncate text-xs text-muted-foreground">
                    {c.email ?? "—"}
                  </span>
                  <span className="w-24 text-xs text-muted-foreground">
                    {leads > 0 ? `${leads} ${leads === 1 ? "lead" : "lead-uri"}` : "fără lead-uri"}
                  </span>
                  <span className="flex w-36 min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <UserAvatar name={agentName(c.assigned_to)} className="size-6 text-[10px]" />
                    <span className="truncate">{agentName(c.assigned_to)}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    {c.phone ? (
                      <>
                        <a
                          href={`tel:${c.phone}`}
                          aria-label={`Sună ${fullName}`}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Phone className="size-4" aria-hidden />
                        </a>
                        <a
                          href={`https://wa.me/${c.phone.replace(/[^\d]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`WhatsApp ${fullName}`}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <MessageCircle className="size-4" aria-hidden />
                        </a>
                      </>
                    ) : null}
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        aria-label={`Email ${fullName}`}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Mail className="size-4" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                  <StatusBadge tone={c.status === "active" ? "success" : "neutral"}>
                    {statusLabels[c.status] ?? c.status}
                  </StatusBadge>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((c) => {
              const leads = leadCounts?.get(c.id) ?? 0;
              const fullName = `${c.first_name} ${c.last_name}`.trim();
              return (
                <Link
                  key={c.id}
                  to="/app/contacts/$id"
                  params={{ id: c.id }}
                  className="rounded-2xl bg-card p-4 text-sm ring-1 ring-border/60 transition hover:ring-primary/40"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar name={fullName} className="size-10 text-sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{fullName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {contactTypeLabels[c.type] ?? c.type}
                      </span>
                    </span>
                  </div>
                  <p className="mt-3 truncate text-xs text-muted-foreground">{c.phone ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.email ?? "—"}</p>
                  <p className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <UserAvatar name={agentName(c.assigned_to)} className="size-6 text-[10px]" />
                      <span className="truncate">{agentName(c.assigned_to)}</span>
                    </span>
                    <span>
                      {leads > 0
                        ? `${leads} ${leads === 1 ? "lead" : "lead-uri"}`
                        : "fără lead-uri"}
                    </span>
                  </p>
                </Link>
              );
            })}
          </div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact nou</DialogTitle>
            <DialogDescription>
              Datele minime necesare; restul se pot completa ulterior.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">Prenume</Label>
                <Input
                  id="first_name"
                  required
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nume</Label>
                <Input
                  id="last_name"
                  required
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Tip</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(contactTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Companie</Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
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
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Renunță
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Salvează
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dezactivezi {selected.length} contacte?</AlertDialogTitle>
            <AlertDialogDescription>
              Contactele vor fi marcate ca inactive (ștergere logică). Poți reveni oricând asupra
              statusului.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                bulkUpdate.mutate({ status: "inactive" });
                setConfirmDeactivate(false);
              }}
            >
              Dezactivează
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PromptDialog request={promptRequest} onClose={() => setPromptRequest(null)} />
    </>
  );
}
