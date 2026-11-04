import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  SlidersHorizontal,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
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
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { useSavedViews } from "@/hooks/use-saved-views";
import { relativeDays } from "@/lib/format";
import { contactTypeLabels } from "@/lib/labels";
import { downloadCsv } from "@/lib/crm";
import { UserAvatar } from "@/components/app/UserAvatar";
import { useFilterList } from "@/hooks/use-list-state";
import { validateListSearch } from "@/lib/list-state";
import { appHead } from "@/components/app/app-head";
import { announceGuideContext } from "@/lib/onboarding-tour";
import { ContactConsentFields } from "@/components/app/ContactConsentFields";
import { CONTACT_SOURCES, EMPTY_CONTACT_CONSENT, contactConsentPatch } from "@/lib/contact-consent";

export const Route = createFileRoute("/_authenticated/app/contacts/")({
  head: () => { const title = "Habitoo CRM — contacte"; const description = "Clienții, proprietarii și partenerii agenției, cu filtre și detalii de contact."; const head = appHead(title); return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  validateSearch: (search: Record<string, unknown>) => validateListSearch(listDefaults, search),
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
  consent: string;
  assigned: string;
  status: string;
  mine: boolean;
  tag: string;
};

const emptyFilters: Filters = {
  q: "",
  type: "all",
  source: "all",
  consent: "all",
  assigned: "all",
  status: "all",
  mine: false,
  tag: "all",
};

const listDefaults = { ...emptyFilters, page: 0, view: "list" as "list" | "card" };

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Sub 640px: un singur set de filtre randat (data-tour unic). */
function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return phone;
}

function ContactsPage() {
  const urlSearch = Route.useSearch();
  const { new: openNew } = urlSearch;
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const persisted = useFilterList("contacts", user?.userId, listDefaults, urlSearch,
    (next) => { void navigate({ search: next, replace: true, resetScroll: false }); });
  const filters: Filters = persisted.state;
  const setFilters = (next: Filters | ((previous: Filters) => Filters)) => {
    const value = typeof next === "function" ? next(filters) : next;
    void navigate({ search: { ...urlSearch, ...value, page: 0 }, replace: true, resetScroll: false });
  };
  const debouncedQ = useDebounced(filters.q);
  const page = persisted.state.page;
  const setPage = (value: number | ((previous: number) => number)) => persisted.set("page", value);
  const view = persisted.state.view;
  const setView = (value: "list" | "card") => persisted.set("view", value);
  const isPhone = useIsPhone();
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(Boolean(openNew));
  useEffect(() => {
    const timer = setTimeout(() => announceGuideContext(dialogOpen ? "contact:creating" : ""), 100);
    return () => clearTimeout(timer);
  }, [dialogOpen]);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);

  const { views, save, remove } = useSavedViews("contacts", user?.organization?.id, user?.userId);

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
    () => [...new Set([...CONTACT_SOURCES, ...metaContacts.map((c) => c.source).filter(Boolean) as string[]])].sort(),
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
      if (filters.consent === "yes") query = query.eq("gdpr_consent", true);
      if (filters.consent === "no") query = query.or("gdpr_consent.eq.false,gdpr_consent.is.null");
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
    ...EMPTY_CONTACT_CONSENT,
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
        ...contactConsentPatch(form),
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["contacts-meta"] });
      setForm({
        ...EMPTY_CONTACT_CONSENT,
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

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);
  const activeCount = (["type", "source", "consent", "assigned", "status", "tag"] as const).filter((k) => filters[k] !== "all").length;

  /** Aceleași câmpuri pe rând (desktop) și în panoul de jos (telefon). */
  const renderFilterSelects = (values: Filters, onChange: (patch: Partial<Filters>) => void, inline: boolean) => {
    const w = (cls: string) => (inline ? cls : "w-full");
    return (
      <>
        <Select value={values.type} onValueChange={(v) => onChange({ type: v })}>
          <SelectTrigger data-tour={inline ? "contacts-type" : undefined} aria-label="Tip contact" className={w("w-44")}>
            <SelectValue placeholder="Tip contact" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate tipurile</SelectItem>
            {Object.entries(contactTypeLabels).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={values.source} onValueChange={(v) => onChange({ source: v })}>
          <SelectTrigger aria-label="Filtru sursă" className={w("w-52")}><SelectValue placeholder="Sursă" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate sursele</SelectItem>
            {sources.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={values.consent} onValueChange={(v) => onChange({ consent: v })}>
          <SelectTrigger aria-label="Filtru consimțământ" className={w("w-52")}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Orice consimțământ</SelectItem><SelectItem value="yes">Cu acord marketing</SelectItem><SelectItem value="no">Fără acord marketing</SelectItem></SelectContent>
        </Select>
        <Select value={values.assigned} onValueChange={(v) => onChange({ assigned: v })}>
          <SelectTrigger aria-label="Agent responsabil" className={w("w-44")}><SelectValue placeholder="Agent responsabil" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toți agenții</SelectItem>
            {agents.map((a) => (<SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={values.status} onValueChange={(v) => onChange({ status: v })}>
          <SelectTrigger aria-label="Status" className={w("w-36")}><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate statusurile</SelectItem>
            {Object.entries(statusLabels).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={values.tag} onValueChange={(v) => onChange({ tag: v })}>
          <SelectTrigger aria-label="Etichetă" className={w("w-36")}><SelectValue placeholder="Etichetă" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate etichetele</SelectItem>
            {tags.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
          </SelectContent>
        </Select>
      </>
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
            <Button data-tour="contact-create-open" size="sm" onClick={() => setDialogOpen(true)}>
              Adaugă contact
            </Button>
          </>
        }
      />

      <div data-tour="contacts-filters" className="space-y-3 rounded-[14px] border border-border bg-card p-4 [&_input]:h-10 [&_input]:rounded-[10px] [&_[role=combobox]]:h-10 [&_[role=combobox]]:rounded-[10px]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 sm:w-auto sm:min-w-56 sm:flex-1">
            <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
            <Input
              data-tour="contacts-search"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Caută nume, telefon, email, companie…"
              className="pl-9"
            />
          </div>
          {isPhone ? null : renderFilterSelects(filters, (patch) => setFilters((f) => ({ ...f, ...patch })), true)}
          <Button
            variant={filters.mine ? "default" : "outline"}
            className="h-10 rounded-[10px]"
            onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
          >
            Doar ale mele
          </Button>
          {isPhone ? (
            <Button
              variant="outline"
              className="h-10 rounded-[10px]"
              data-tour="contacts-type"
              onClick={() => { setDraft(filters); setSheetOpen(true); }}
            >
              <SlidersHorizontal className="size-4" /> Filtre{activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>
          ) : null}
          <button type="button" onClick={saveFilter} className="inline-flex h-10 items-center gap-1.5 px-2 text-sm font-semibold text-gold-dark hover:underline">
            <Bookmark className="size-4" /> Salvează filtrul
          </button>
          <button type="button" onClick={persisted.reset} className="inline-flex h-10 items-center gap-1.5 px-2 text-sm font-semibold text-gold-dark hover:underline">
            <X className="size-4" /> Resetează
          </button>
          <Tabs value={view} onValueChange={(v) => setView(v as "list" | "card")} className="ml-auto">
            <TabsList variant="segmented">
              <TabsTrigger value="list" aria-label="Vizualizare listă" data-tour="contacts-list-view">
                <List className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="card" aria-label="Vizualizare carduri" data-tour="contacts-cards">
                <LayoutGrid className="size-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {views.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Filtre salvate:</span>
            {views.map((v) => (
              <button
                type="button"
                key={v.id}
                className={cn(badgeVariants({ variant: "outline" }), "min-h-8 cursor-pointer px-3 text-sm font-semibold hover:bg-muted")}
                onClick={() => setFilters({ ...emptyFilters, ...(v.config as Partial<Filters>) })}
                onDoubleClick={() => remove.mutate(v.id)}
                title="Dublu-click pentru a șterge"
              >
                {v.name}
              </button>
            ))}
          </div>
        ) : null}

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-gold/40 bg-gold-tint px-4 py-3">
            <span className="text-sm font-medium">{selected.length} selectate</span>
            <Select onValueChange={(v) => bulkUpdate.mutate({ assigned_to: v })}>
              <SelectTrigger className="w-full sm:w-48">
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
              <SelectTrigger className="w-full sm:w-40">
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
                      className="block truncate text-[15px] font-bold hover:text-primary"
                    >
                      {fullName}
                    </Link>
                    <p className="mt-0.5 hidden flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground sm:flex">
                      <span>{contactTypeLabels[c.type] ?? c.type}</span>
                      {c.company || c.source ? <span>· {c.company || c.source}</span> : null}
                      <span>· adăugat {relativeDays(c.created_at)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground sm:hidden">
                      {contactTypeLabels[c.type] ?? c.type}{c.phone ? ` · ${c.phone}` : ""}
                    </p>
                  </div>
                  <span className="hidden w-36 shrink-0 text-[13px] text-muted-foreground sm:block">{c.phone ?? "—"}</span>
                  <span className="hidden w-52 shrink-0 truncate text-[13px] text-muted-foreground lg:block">
                    {c.email ?? "—"}
                  </span>
                  <span className="hidden w-24 shrink-0 text-[13px] text-muted-foreground lg:block">
                    {leads > 0 ? `${leads} ${leads === 1 ? "lead" : "lead-uri"}` : "fără lead-uri"}
                  </span>
                  <span className="hidden w-36 shrink-0 min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground xl:flex">
                    <UserAvatar name={agentName(c.assigned_to)} className="size-6 text-[10px]" />
                    <span className="truncate">{agentName(c.assigned_to)}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {c.phone ? (
                      <>
                        <a
                          href={`tel:${c.phone}`}
                          aria-label={`Sună ${fullName}`}
                          className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:size-10"
                        >
                          <Phone className="size-4" aria-hidden />
                        </a>
                        <a
                          href={`https://wa.me/${c.phone.replace(/[^\d]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`WhatsApp ${fullName}`}
                          className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:size-10"
                        >
                          <MessageCircle className="size-4" aria-hidden />
                        </a>
                      </>
                    ) : null}
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        aria-label={`Email ${fullName}`}
                        className="hidden size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
                      >
                        <Mail className="size-4" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                  <StatusBadge className="shrink-0" tone={c.status === "active" ? "success" : "neutral"}>
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
                  className="rounded-[14px] border border-border bg-card p-4 text-sm transition hover:border-gold/60"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar name={fullName} className="size-10 text-sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">{fullName}</span>
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
        <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} din {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-10"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              className="h-10"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Următor
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-tour="contact-create-form" className="max-h-[90dvh] overflow-y-auto">
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
                  <SelectTrigger data-tour="contact-create-type">
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
            <ContactConsentFields value={form} onChange={patch => setForm(f => ({ ...f, ...patch }))} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Renunță
              </Button>
              <Button data-tour="contact-create-save" type="submit" disabled={create.isPending}>
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto [&_[role=combobox]]:h-10 [&_[role=combobox]]:w-full [&_[role=combobox]]:rounded-[10px]">
          <SheetHeader>
            <SheetTitle>Filtre</SheetTitle>
            <SheetDescription>Alege criteriile, apoi apasă „Aplică”.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid gap-3">
            {renderFilterSelects(draft, (patch) => setDraft((d) => ({ ...d, ...patch })), false)}
          </div>
          <SheetFooter className="mt-4 flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={() => { persisted.reset(); setSheetOpen(false); }}>
              Resetează
            </Button>
            <Button className="h-11 w-full sm:w-auto" onClick={() => { setFilters((f) => ({ ...f, ...draft, q: f.q, mine: f.mine })); setSheetOpen(false); }}>
              Aplică
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <PromptDialog request={promptRequest} onClose={() => setPromptRequest(null)} />
    </>
  );
}
