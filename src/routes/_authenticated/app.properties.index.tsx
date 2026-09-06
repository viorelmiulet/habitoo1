import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  LayoutGrid,
  List,
  Search,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { CardGridSkeleton, ListSkeleton } from "@/components/app/LoadingState";
import { PropertyThumb, usePropertyCovers } from "@/components/app/PropertyThumb";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { PromptDialog, type PromptRequest } from "@/components/app/PromptDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { formatMoney, formatNumber, relativeDays } from "@/lib/format";
import { downloadCsv } from "@/lib/crm";
import {
  propertyStatusLabels,
  propertyStatusTone,
  propertyTypeLabels,
  transactionLabels,
} from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/app/properties/")({
  component: PropertiesPage,
});

type Filters = {
  q: string;
  status: string;
  transaction: string;
  type: string;
  city: string;
  district: string;
  agent: string;
  source: string;
  mine: boolean;
  favoritesOnly: boolean;
  priceMin: string;
  priceMax: string;
  surfaceMin: string;
  surfaceMax: string;
  rooms: string;
  bathrooms: string;
  floor: string;
  addedAfter: string;
  addedBefore: string;
};

const emptyFilters: Filters = {
  q: "",
  status: "all",
  transaction: "all",
  type: "all",
  city: "all",
  district: "all",
  agent: "all",
  source: "all",
  mine: false,
  favoritesOnly: false,
  priceMin: "",
  priceMax: "",
  surfaceMin: "",
  surfaceMax: "",
  rooms: "",
  bathrooms: "",
  floor: "",
  addedAfter: "",
  addedBefore: "",
};

type SortKey = "created_desc" | "updated_desc" | "price_asc" | "price_desc" | "surface_asc" | "surface_desc";

const sortOptions: Record<SortKey, string> = {
  created_desc: "Dată adăugare (nou→vechi)",
  updated_desc: "Dată modificare (recent)",
  price_asc: "Preț crescător",
  price_desc: "Preț descrescător",
  surface_asc: "Suprafață crescătoare",
  surface_desc: "Suprafață descrescătoare",
};

const COLUMNS_KEY = "imobiflow.propertyColumns";
const allColumns = [
  { key: "type", label: "Tip" },
  { key: "transaction", label: "Tranzacție" },
  { key: "status", label: "Status" },
  { key: "price", label: "Preț" },
  { key: "surface", label: "Suprafață" },
  { key: "agent", label: "Agent" },
  { key: "updated", label: "Actualizat" },
] as const;
type ColumnKey = (typeof allColumns)[number]["key"];

function readColumns(): ColumnKey[] {
  if (typeof window === "undefined") return allColumns.map((c) => c.key);
  try {
    const stored = JSON.parse(window.localStorage.getItem(COLUMNS_KEY) ?? "null");
    if (Array.isArray(stored)) return stored;
  } catch {
    /* ignore */
  }
  return allColumns.map((c) => c.key);
}

const PAGE_SIZE = 25;

function PropertiesPage() {
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<"list" | "grid">("list");
  const [columns, setColumns] = useState<ColumnKey[]>(readColumns);
  const [sort, setSort] = useState<SortKey>("created_desc");
  const [page, setPage] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState<string[] | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);

  const savedViews = useSavedViews("properties", orgId, user?.userId);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  useEffect(() => {
    window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns));
  }, [columns]);

  useEffect(() => {
    setPage(0);
  }, [filters, sort]);

  const { data: agents = [] } = useQuery({
    queryKey: ["profiles", "org", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("organization_id", orgId as string)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: favoriteIds = [] } = useQuery({
    queryKey: ["property-favorites", user?.userId],
    enabled: Boolean(user?.userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_favorites")
        .select("property_id")
        .eq("user_id", user!.userId);
      if (error) throw error;
      return data.map((f) => f.property_id);
    },
  });

  const { data: meta } = useQuery({
    queryKey: ["properties-meta", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("city,district,source")
        .eq("organization_id", orgId as string)
        .is("deleted_at", null);
      if (error) throw error;
      return {
        cities: [...new Set(data.map((p) => p.city).filter(Boolean) as string[])].sort(),
        districts: [...new Set(data.map((p) => p.district).filter(Boolean) as string[])].sort(),
        sources: [...new Set(data.map((p) => p.source).filter(Boolean) as string[])].sort(),
      };
    },
  });

  const sortColumn: Record<SortKey, { col: string; asc: boolean }> = {
    created_desc: { col: "created_at", asc: false },
    updated_desc: { col: "updated_at", asc: false },
    price_asc: { col: "price", asc: true },
    price_desc: { col: "price", asc: false },
    surface_asc: { col: "surface", asc: true },
    surface_desc: { col: "surface", asc: false },
  };

  const { data: result, isLoading } = useQuery({
    queryKey: ["properties", orgId, filters, debouncedQ, sort, page, favoriteIds],
    enabled: Boolean(orgId),
    queryFn: async () => {
      let query = supabase
        .from("properties")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId as string)
        .is("deleted_at", null);

      if (filters.status !== "all") query = query.eq("status", filters.status as never);
      // Arhivele nu apar în lista implicită; sunt vizibile doar cu filtrul de status "Arhivat".
      else query = query.neq("status", "archived" as never);
      if (filters.transaction !== "all") query = query.eq("transaction_kind", filters.transaction as never);
      if (filters.type !== "all") query = query.eq("property_type", filters.type);
      if (filters.city !== "all") query = query.eq("city", filters.city);
      if (filters.district !== "all") query = query.eq("district", filters.district);
      if (filters.source !== "all") query = query.eq("source", filters.source);
      if (filters.agent !== "all") query = query.eq("assigned_to", filters.agent);
      if (filters.mine && user?.userId) query = query.eq("assigned_to", user.userId);
      if (filters.priceMin) query = query.gte("price", Number(filters.priceMin));
      if (filters.priceMax) query = query.lte("price", Number(filters.priceMax));
      if (filters.surfaceMin) query = query.gte("surface", Number(filters.surfaceMin));
      if (filters.surfaceMax) query = query.lte("surface", Number(filters.surfaceMax));
      if (filters.rooms) query = query.eq("rooms", Number(filters.rooms));
      if (filters.bathrooms) query = query.eq("bathrooms", Number(filters.bathrooms));
      if (filters.floor) query = query.eq("floor", Number(filters.floor));
      if (filters.addedAfter) query = query.gte("created_at", filters.addedAfter);
      if (filters.addedBefore) query = query.lte("created_at", filters.addedBefore);
      if (filters.favoritesOnly) {
        if (favoriteIds.length === 0) return { rows: [], count: 0 };
        query = query.in("id", favoriteIds);
      }
      if (debouncedQ) {
        const q = debouncedQ.replace(/[%,()"\\]/g, " ").trim();
        query = query.or(
          `title.ilike.%${q}%,reference.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,district.ilike.%${q}%`,
        );
      }

      const { col, asc } = sortColumn[sort];
      query = query.order(col, { ascending: asc, nullsFirst: false });
      query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });

  const rows = result?.rows ?? [];
  // Coverul fiecărei proprietăți din pagina curentă (is_primary → prima poziție).
  const coverOf = usePropertyCovers(rows.map((r) => r.id));
  const total = result?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ["properties"] });

  const updateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase.from("properties").update({ status: status as never }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateList();
      setSelected([]);
      toast.success("Statusul a fost actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const assignAgent = useMutation({
    mutationFn: async ({ ids, agentId }: { ids: string[]; agentId: string }) => {
      const { error } = await supabase.from("properties").update({ assigned_to: agentId } as never).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateList();
      setSelected([]);
      toast.success("Agent asignat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const archiveMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("properties").update({ status: "archived" as never }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateList();
      setSelected([]);
      setArchiveTarget(null);
      toast.success("Proprietăți arhivate.");
    },
    onError: (e: Error) => toastError(e),
  });

  const addTag = useMutation({
    mutationFn: async ({ ids, tag }: { ids: string[]; tag: string }) => {
      const targets = rows.filter((r) => ids.includes(r.id));
      await Promise.all(
        targets.map((r) =>
          supabase
            .from("properties")
            .update({ tags: [...new Set([...(r.tags ?? []), tag])] } as never)
            .eq("id", r.id),
        ),
      );
    },
    onSuccess: () => {
      invalidateList();
      setSelected([]);
      toast.success("Etichetă adăugată.");
    },
    onError: (e: Error) => toastError(e),
  });

  const publishMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("properties")
        .update({ publish_status: "published", published_at: new Date().toISOString() } as never)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateList();
      setSelected([]);
      toast.success("Proprietăți publicate.");
    },
    onError: (e: Error) => toastError(e),
  });

  const toggleFavorite = useMutation({
    mutationFn: async (propertyId: string) => {
      if (!user?.userId || !orgId) throw new Error("Sesiune indisponibilă.");
      const isFav = favoriteIds.includes(propertyId);
      if (isFav) {
        const { error } = await supabase
          .from("property_favorites")
          .delete()
          .eq("property_id", propertyId)
          .eq("user_id", user.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("property_favorites").insert({
          organization_id: orgId,
          property_id: propertyId,
          user_id: user.userId,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["property-favorites", user?.userId] }),
    onError: (e: Error) => toastError(e),
  });

  const allSelected = rows.length > 0 && selected.length === rows.length;

  const exportCsv = () => {
    downloadCsv(
      "proprietati.csv",
      rows.map((p) => ({
        Referință: p.reference ?? "",
        Titlu: p.title,
        Tip: propertyTypeLabels[p.property_type] ?? p.property_type,
        Tranzacție: transactionLabels[p.transaction_kind],
        Status: propertyStatusLabels[p.status],
        Oraș: p.city ?? "",
        Preț: p.price ?? "",
        Suprafață: p.surface ?? "",
      })),
    );
  };

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.full_name ?? "—";

  const saveFilter = () => {
    setPromptRequest({
      title: "Salvează filtrul curent",
      description: "Filtrele active vor fi salvate sub un nume, pentru a le reaplica rapid.",
      label: "Numele filtrului",
      placeholder: "ex. Apartamente 2 camere, Nord",
      confirmLabel: "Salvează",
      onSubmit: (name) => savedViews.save.mutateAsync({ name, config: filters as unknown as Record<string, unknown> }),
    });
  };

  return (
    <>
      <PageHeader
        title="Proprietăți"
        description="Portofoliul agenției, cu filtrare avansată, editare rapidă și acțiuni în masă."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button size="sm" asChild>
              <Link to="/app/properties/new">Adaugă proprietate</Link>
            </Button>
          </>
        }
      />

      <div className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Caută după titlu, referință, adresă…"
              className="pl-9"
            />
          </div>

          <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate statusurile</SelectItem>
              {Object.entries(propertyStatusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.transaction} onValueChange={(v) => setFilters((f) => ({ ...f, transaction: v }))}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Tranzacție" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              <SelectItem value="sale">Vânzare</SelectItem>
              <SelectItem value="rent">Închiriere</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.type} onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tip" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate tipurile</SelectItem>
              {Object.entries(propertyTypeLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Sortare" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(sortOptions).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={view === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setView("list")}
            title="Vizualizare listă"
            aria-label="Vizualizare listă"
            aria-pressed={view === "list"}
          >
            <List className="size-4" />
          </Button>
          <Button
            variant={view === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setView("grid")}
            title="Vizualizare carduri"
            aria-label="Vizualizare carduri"
            aria-pressed={view === "grid"}
          >
            <LayoutGrid className="size-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" title="Coloane">
                <Columns3 className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {allColumns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={columns.includes(c.key)}
                  onCheckedChange={(checked) =>
                    setColumns((cols) => (checked ? [...cols, c.key] : cols.filter((k) => k !== c.key)))
                  }
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Select value={filters.district} onValueChange={(v) => setFilters((f) => ({ ...f, district: v }))}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Zonă" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate zonele</SelectItem>
              {(meta?.districts ?? []).map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.city} onValueChange={(v) => setFilters((f) => ({ ...f, city: v }))}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Oraș" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate orașele</SelectItem>
              {(meta?.cities ?? []).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.agent} onValueChange={(v) => setFilters((f) => ({ ...f, agent: v }))}>
            <SelectTrigger className="w-40">
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
          <Select value={filters.source} onValueChange={(v) => setFilters((f) => ({ ...f, source: v }))}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Sursă" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate sursele</SelectItem>
              {(meta?.sources ?? []).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="w-28"
            placeholder="Preț min"
            type="number"
            value={filters.priceMin}
            onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))}
          />
          <Input
            className="w-28"
            placeholder="Preț max"
            type="number"
            value={filters.priceMax}
            onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))}
          />
          <Input
            className="w-32"
            placeholder="Supr. min (m²)"
            type="number"
            value={filters.surfaceMin}
            onChange={(e) => setFilters((f) => ({ ...f, surfaceMin: e.target.value }))}
          />
          <Input
            className="w-32"
            placeholder="Supr. max (m²)"
            type="number"
            value={filters.surfaceMax}
            onChange={(e) => setFilters((f) => ({ ...f, surfaceMax: e.target.value }))}
          />
          <Input
            className="w-24"
            placeholder="Camere"
            type="number"
            value={filters.rooms}
            onChange={(e) => setFilters((f) => ({ ...f, rooms: e.target.value }))}
          />
          <Input
            className="w-24"
            placeholder="Băi"
            type="number"
            value={filters.bathrooms}
            onChange={(e) => setFilters((f) => ({ ...f, bathrooms: e.target.value }))}
          />
          <Input
            className="w-24"
            placeholder="Etaj"
            type="number"
            value={filters.floor}
            onChange={(e) => setFilters((f) => ({ ...f, floor: e.target.value }))}
          />
          <Input
            className="w-40"
            type="date"
            title="Adăugat după"
            value={filters.addedAfter}
            onChange={(e) => setFilters((f) => ({ ...f, addedAfter: e.target.value }))}
          />
          <Input
            className="w-40"
            type="date"
            title="Adăugat înainte"
            value={filters.addedBefore}
            onChange={(e) => setFilters((f) => ({ ...f, addedBefore: e.target.value }))}
          />
          <Button
            variant={filters.mine ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
          >
            Doar ale mele
          </Button>
          <Button
            variant={filters.favoritesOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters((f) => ({ ...f, favoritesOnly: !f.favoritesOnly }))}
          >
            <Star className="size-4" /> Doar favorite
          </Button>
          <Button variant="ghost" size="sm" onClick={saveFilter}>
            Salvează filtrul
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
            <X className="size-4" /> Resetează
          </Button>
        </div>

        {savedViews.views.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Filtre salvate:</span>
            {savedViews.views.map((v) => (
              <Button
                key={v.id}
                variant="secondary"
                size="sm"
                onClick={() => setFilters({ ...emptyFilters, ...(v.config as Partial<Filters>) })}
              >
                {v.name}
              </Button>
            ))}
          </div>
        ) : null}

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="text-sm font-medium">{selected.length} selectate</span>
            <Select onValueChange={(v) => updateStatus.mutate({ ids: selected, status: v })}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Schimbă statusul" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(propertyStatusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => assignAgent.mutate({ ids: selected, agentId: v })}>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPromptRequest({
                  title: "Adaugă etichetă",
                  description: `Eticheta va fi adăugată la ${selected.length} ${selected.length === 1 ? "proprietate" : "proprietăți"}.`,
                  label: "Etichetă",
                  placeholder: "ex. exclusivitate",
                  confirmLabel: "Adaugă",
                  onSubmit: (tag) => addTag.mutateAsync({ ids: selected, tag }),
                })
              }
            >
              Adaugă etichetă
            </Button>
            <Button variant="outline" size="sm" onClick={() => publishMany.mutate(selected)}>
              Publică
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setArchiveTarget(selected)}>
              Arhivează
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Anulează selecția
            </Button>
          </div>
        ) : null}
      </div>

      <div className="panel overflow-hidden">
        {view === "list" ? (
          <>
            <div className="hidden items-center gap-3 border-b border-border px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:flex">
              <Checkbox checked={allSelected} onCheckedChange={(c) => setSelected(c ? rows.map((r) => r.id) : [])} />
              <span className="w-4" aria-hidden />
              <span className="w-[120px]">Foto</span>
              <span className="flex-1">Proprietate</span>
              {columns.includes("type") ? <span className="w-28">Tip</span> : null}
              {columns.includes("transaction") ? <span className="w-24">Tranzacție</span> : null}
              {columns.includes("status") ? <span className="w-28">Status</span> : null}
              {columns.includes("price") ? <span className="w-28 text-right">Preț</span> : null}
              {columns.includes("surface") ? <span className="w-24 text-right">Suprafață</span> : null}
              {columns.includes("agent") ? <span className="w-32">Agent</span> : null}
              {columns.includes("updated") ? <span className="w-24 text-right">Actualizat</span> : null}
            </div>

            {isLoading ? (
              <ListSkeleton rows={8} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="Nicio proprietate găsită"
                description="Ajustează filtrele sau adaugă o proprietate nouă în portofoliu."
                action={
                  <Button asChild size="sm">
                    <Link to="/app/properties/new">Adaugă proprietate</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm lg:flex-nowrap">
                    <Checkbox
                      checked={selected.includes(p.id)}
                      onCheckedChange={(c) =>
                        setSelected((s) => (c ? [...s, p.id] : s.filter((id) => id !== p.id)))
                      }
                    />
                    <button type="button" onClick={() => toggleFavorite.mutate(p.id)} title="Favorit">
                      <Star
                        className={`size-4 ${favoriteIds.includes(p.id) ? "fill-warning text-warning" : "text-muted-foreground"}`}
                      />
                    </button>
                    <PropertyThumb
                      propertyId={p.id}
                      title={p.title}
                      cover={coverOf(p.id)}
                      className="h-[90px] w-[110px] sm:h-[100px] sm:w-[120px]"
                    />
                    <div className="min-w-0 flex-1">
                      <Link to="/app/properties/$id" params={{ id: p.id }} className="block truncate font-medium hover:text-primary">
                        {p.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.reference ? `${p.reference} · ` : ""}
                        {[p.district, p.city].filter(Boolean).join(", ") || "Locație nespecificată"}
                      </p>
                    </div>
                    {columns.includes("type") ? (
                      <span className="w-28 text-xs text-muted-foreground">
                        {propertyTypeLabels[p.property_type] ?? p.property_type}
                      </span>
                    ) : null}
                    {columns.includes("transaction") ? (
                      <span className="w-24 text-xs text-muted-foreground">{transactionLabels[p.transaction_kind]}</span>
                    ) : null}
                    {columns.includes("status") ? (
                      <span className="w-28">
                        <StatusBadge tone={propertyStatusTone[p.status]}>{propertyStatusLabels[p.status]}</StatusBadge>
                      </span>
                    ) : null}
                    {columns.includes("price") ? (
                      <span className="w-28 text-right font-medium">{formatMoney(p.price, p.currency)}</span>
                    ) : null}
                    {columns.includes("surface") ? (
                      <span className="w-24 text-right text-xs text-muted-foreground">
                        {p.surface ? `${formatNumber(p.surface)} m²` : "—"}
                      </span>
                    ) : null}
                    {columns.includes("agent") ? (
                      <span className="w-32 truncate text-xs text-muted-foreground">{agentName(p.assigned_to)}</span>
                    ) : null}
                    {columns.includes("updated") ? (
                      <span className="w-24 text-right text-xs text-muted-foreground">{relativeDays(p.updated_at)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : isLoading ? (
          <CardGridSkeleton count={6} className="p-4" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Building2} title="Nicio proprietate găsită" />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p) => (
              <div key={p.id} className="panel space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Checkbox
                    checked={selected.includes(p.id)}
                    onCheckedChange={(c) => setSelected((s) => (c ? [...s, p.id] : s.filter((id) => id !== p.id)))}
                  />
                  <button type="button" onClick={() => toggleFavorite.mutate(p.id)} title="Favorit">
                    <Star
                      className={`size-4 ${favoriteIds.includes(p.id) ? "fill-warning text-warning" : "text-muted-foreground"}`}
                    />
                  </button>
                </div>
                <PropertyThumb
                  propertyId={p.id}
                  title={p.title}
                  cover={coverOf(p.id)}
                  className="h-40 w-full"
                />
                <Link to="/app/properties/$id" params={{ id: p.id }} className="line-clamp-2 font-medium hover:text-primary">
                  {p.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {[p.district, p.city].filter(Boolean).join(", ") || "Locație nespecificată"}
                </p>
                <div className="flex items-center justify-between">
                  <StatusBadge tone={propertyStatusTone[p.status]}>{propertyStatusLabels[p.status]}</StatusBadge>
                  <span className="font-semibold">{formatMoney(p.price, p.currency)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {propertyTypeLabels[p.property_type] ?? p.property_type} · {transactionLabels[p.transaction_kind]} ·{" "}
                  {p.surface ? `${formatNumber(p.surface)} m²` : "—"}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
          <span className="text-xs text-muted-foreground">
            {total > 0 ? `${page * PAGE_SIZE + 1}–${Math.min(total, (page + 1) * PAGE_SIZE)} din ${total}` : "0 rezultate"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Pagina anterioară" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              Pagina {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Pagina următoare"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={archiveTarget !== null} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arhivezi proprietățile selectate?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.length} proprietăți vor fi marcate ca arhivate. Poți reveni oricând asupra statusului.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveTarget && archiveMany.mutate(archiveTarget)}>
              Arhivează
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PromptDialog request={promptRequest} onClose={() => setPromptRequest(null)} />
    </>
  );
}
