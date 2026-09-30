import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { StatusChangeDialog } from "@/components/app/StatusChangeDialog";
import { isWithdrawStatus } from "@/components/app/StatusWithdrawPreview";
import { changePropertyStatus } from "@/lib/property-status.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveRestore,
  Trash2,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
  MoreVertical,
  Pencil,
  LayoutGrid,
  List,
  Send,
  Search,
  Star,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { CardGridSkeleton, ListSkeleton } from "@/components/app/LoadingState";
import { usePropertyPortals } from "@/components/app/PropertyPortalsCell";
import { PortalFilterSelect, portalFilterLabel } from "@/components/app/PortalFilterSelect";
import { getPortalFilterOptions, getPropertyIdsByPortalState } from "@/lib/portals.functions";
import { parsePortalFilter } from "@/lib/portals/portal-state";
import { PropertyCard, type PropertyCardRow } from "@/components/app/PropertyCard";
import { useServerFn } from "@tanstack/react-start";
import { archiveProperty, unarchiveProperty } from "@/lib/property-archive.functions";
import { reassignPropertyAgent } from "@/lib/property-agent.functions";
import { PropertyThumb, usePropertyCovers } from "@/components/app/PropertyThumb";
import { PropertyPublishView } from "@/components/app/PropertyPublishView";
import { PortalBulkProgress } from "@/components/app/PortalBulkProgress";
import { PortalBulkSelectionDialog } from "@/components/app/PortalBulkSelectionDialog";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  DropdownMenuContent,
  DropdownMenuItem,
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
import { DeletePropertyDialog, canDeleteProperty } from "@/components/app/DeletePropertyDialog";
import { useSavedViews } from "@/hooks/use-saved-views";
import { relativeDays } from "@/lib/format";
import { downloadCsv } from "@/lib/crm";
import {
  propertyStatusLabels,
  propertyStatusTone,
  propertyTypeLabels,
  transactionLabels,
} from "@/lib/labels";
import { appHead } from "@/components/app/app-head";
import { cn } from "@/lib/utils";
import { canShowDeleteAction, formatPropertyListDetails, formatPropertyListPrice, portalDotTone, portalStateLabel } from "@/lib/property-list-row";
import {
  emptyPropertyListFilters,
  buildCityFilterOptions,
  buildDistrictFilterOptions,
  cityRawValues,
  formatPropertySourceLabel,
  formatThousands,
  isAtLeastFilter,
  normalizeSavedPropertyFilters,
  numericFilterValue,
  PROPERTY_TYPE_TABS,
  propertyListSearchFromState,
  propertyListSearchSchema,
  propertyListStateFromSearch,
  romaniaDateBoundary,
  shouldShowAdvancedFilters,
  type PropertyListFilters,
  type PropertyListSort,
  type PropertyListView,
} from "@/lib/property-list-filters";
import type { BulkDraft } from "@/lib/portals/bulk";

export const Route = createFileRoute("/_authenticated/app/properties/")({
  validateSearch: (search) => propertyListSearchSchema.parse(search),
  head: () => appHead("Habitoo CRM — proprietăți"),
  component: PropertiesPage,
});

type Filters = PropertyListFilters;
const emptyFilters = emptyPropertyListFilters;

type SortKey = PropertyListSort;

const sortOptions: Record<SortKey, string> = {
  created_desc: "Dată adăugare (nou→vechi)",
  updated_desc: "Dată modificare (recent)",
  price_asc: "Preț crescător",
  price_desc: "Preț descrescător",
  surface_asc: "Suprafață crescătoare",
  surface_desc: "Suprafață descrescătoare",
};

const FILTERS_EXPANDED_KEY = "habitoo.propertyFiltersExpanded.v1";

const fieldLabelClass =
  "mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground";
const valuedControlClass = "border-primary bg-primary/5";

const PAGE_SIZE = 25;

function PropertiesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const urlState = propertyListStateFromSearch(search);
  const filters = urlState.filters;
  const sort = urlState.sort;
  const page = urlState.page - 1;
  const view = urlState.view;
  const urlStateRef = useRef(urlState);
  urlStateRef.current = urlState;
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState(filters.q);
  const [selected, setSelected] = useState<string[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [archiveTarget, setArchiveTarget] = useState<string[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  const [portalDrafts, setPortalDrafts] = useState<Record<string, BulkDraft>>({});
  const [portalBulkMode, setPortalBulkMode] = useState<"publish" | "withdraw" | null>(null);
  const [portalBulkJobId, setPortalBulkJobId] = useState<string | null>(null);
  const archivePropertyFn = useServerFn(archiveProperty);
  const unarchivePropertyFn = useServerFn(unarchiveProperty);

  const savedViews = useSavedViews("properties", orgId, user?.userId);

  useEffect(() => {
    setSearchInput(filters.q);
  }, [filters.q]);

  const writeUrlState = (
    nextFilters: Filters,
    nextSort = sort,
    nextPage = 1,
    nextView = view,
    replace = false,
  ) => navigate({
    search: propertyListSearchFromState(nextFilters, nextSort, nextPage, nextView),
    replace,
  });

  const setFilters = (updater: Filters | ((current: Filters) => Filters)) => {
    const next = typeof updater === "function" ? updater(filters) : updater;
    void writeUrlState(next);
  };

  const setSort = (nextSort: SortKey) => void writeUrlState(filters, nextSort);
  const setView = (nextView: PropertyListView) => {
    if (nextView !== "publish" && view === "publish" && Object.keys(portalDrafts).length > 0) {
      if (!window.confirm(`Renunți la ${Object.keys(portalDrafts).length} modificări?`)) return;
      setPortalDrafts({});
    }
    void writeUrlState(filters, sort, urlState.page, nextView);
  };
  const setPage = (updater: number | ((current: number) => number)) => {
    const nextZeroBased = typeof updater === "function" ? updater(page) : updater;
    void writeUrlState(filters, sort, nextZeroBased + 1, view);
  };

  useEffect(() => {
    if (searchInput.trim() === filters.q) return;
    const t = setTimeout(() => {
      const latest = urlStateRef.current;
      void writeUrlState({ ...latest.filters, q: searchInput.trim() }, latest.sort, 1, latest.view, true);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.q, sort, view]);

  useBlocker({
    disabled: Object.keys(portalDrafts).length === 0,
    enableBeforeUnload: true,
    shouldBlockFn: ({ current, next }) => {
      if (current.pathname === next.pathname) return false;
      return !window.confirm(`Renunți la ${Object.keys(portalDrafts).length} modificări?`);
    },
  });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FILTERS_EXPANDED_KEY);
      setFiltersExpanded(saved === null ? window.innerWidth >= 768 : saved === "true");
    } catch {
      setFiltersExpanded(window.innerWidth >= 768);
    }
  }, []);

  const toggleFiltersExpanded = () => {
    setFiltersExpanded((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(FILTERS_EXPANDED_KEY, String(next));
      } catch {
        /* Browsers may deny localStorage access. */
      }
      return next;
    });
  };

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
        rows: data,
        sources: [...new Set(data.map((p) => p.source).filter(Boolean) as string[])].sort(),
      };
    },
  });

  const cityOptions = useMemo(() => buildCityFilterOptions(meta?.rows ?? []), [meta?.rows]);
  const selectedCityRawValues = useMemo(
    () => cityRawValues(cityOptions, filters.city),
    [cityOptions, filters.city],
  );
  const districtOptions = useMemo(
    () => buildDistrictFilterOptions(meta?.rows ?? [], filters.city, cityOptions),
    [meta?.rows, filters.city, cityOptions],
  );

  useEffect(() => {
    if (meta?.rows && filters.district !== "all" && !districtOptions.some((option) => option.value === filters.district)) {
      setFilters((current) => ({ ...current, district: "all" }));
    }
  }, [districtOptions, filters.district, meta?.rows]);

  const { data: portfolioTotal = 0 } = useQuery({
    queryKey: ["properties", "portfolio-count", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId as string)
        .is("deleted_at", null)
        .neq("status", "archived" as never);
      if (error) throw error;
      return count ?? 0;
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

  const loadPortalOptions = useServerFn(getPortalFilterOptions);
  const loadPortalIds = useServerFn(getPropertyIdsByPortalState);
  const { data: portalOptions = [] } = useQuery({
    queryKey: ["property-portals-matrix", "filter-options", orgId],
    enabled: Boolean(orgId),
    queryFn: () => loadPortalOptions({ data: { organizationId: orgId } }),
  });
  // Filtrul se aplică doar pe un portal încă activat (sau „any”).
  const parsedPortal = parsePortalFilter(filters.portal);
  const portalFilter =
    parsedPortal &&
    (parsedPortal.portal === "any" || portalOptions.some((o) => o.portalId === parsedPortal.portal))
      ? parsedPortal
      : null;
  const { data: portalIds, isLoading: portalIdsLoading } = useQuery({
    queryKey: ["property-portals-matrix", "filter-ids", orgId, portalFilter],
    enabled: Boolean(orgId && portalFilter),
    queryFn: () =>
      loadPortalIds({
        data: { organizationId: orgId, portal: portalFilter!.portal, state: portalFilter!.state },
      }),
  });

  const { data: result, isLoading: listLoading } = useQuery({
    // (isLoading de mai jos combină și încărcarea filtrului de portaluri)
    queryKey: ["properties", orgId, filters, sort, page, favoriteIds, portalIds],
    enabled: Boolean(orgId) && (!portalFilter || portalIds !== undefined),
    queryFn: async () => {
      let query = supabase
        .from("properties")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId as string)
        .is("deleted_at", null);

      if (filters.status !== "all") query = query.eq("status", filters.status as never);
      // Arhivele nu apar în lista implicită; revin la vedere cu "Arată și arhivate"
      // sau când se filtrează explicit după statusul "Arhivat".
      else if (!filters.showArchived) query = query.neq("status", "archived" as never);
      if (filters.transaction !== "all")
        query = query.eq("transaction_kind", filters.transaction as never);
      if (filters.type !== "all") query = query.eq("property_type", filters.type);
      if (filters.city !== "all") {
        query = query.in("city", selectedCityRawValues.length > 0 ? selectedCityRawValues : [filters.city]);
      }
      if (filters.district !== "all") query = query.eq("district", filters.district);
      if (filters.source !== "all") query = query.eq("source", filters.source);
      if (filters.agent !== "all") query = query.eq("assigned_to", filters.agent);
      if (filters.mine && user?.userId) query = query.eq("assigned_to", user.userId);
      if (filters.priceMin) query = query.gte("price", Number(filters.priceMin));
      if (filters.priceMax) query = query.lte("price", Number(filters.priceMax));
      if (filters.surfaceMin) query = query.gte("surface", Number(filters.surfaceMin));
      if (filters.surfaceMax) query = query.lte("surface", Number(filters.surfaceMax));
      if (filters.rooms)
        query = isAtLeastFilter(filters.rooms)
          ? query.gte("rooms", numericFilterValue(filters.rooms))
          : query.eq("rooms", numericFilterValue(filters.rooms));
      if (filters.bathrooms)
        query = isAtLeastFilter(filters.bathrooms)
          ? query.gte("bathrooms", numericFilterValue(filters.bathrooms))
          : query.eq("bathrooms", numericFilterValue(filters.bathrooms));
      if (filters.floorMin) query = query.gte("floor", Number(filters.floorMin));
      if (filters.floorMax) query = query.lte("floor", Number(filters.floorMax));
      if (filters.addedAfter) query = query.gte("created_at", romaniaDateBoundary(filters.addedAfter, "start"));
      if (filters.addedBefore) query = query.lte("created_at", romaniaDateBoundary(filters.addedBefore, "end"));
      if (filters.favoritesOnly) {
        if (favoriteIds.length === 0) return { rows: [], count: 0 };
        query = query.in("id", favoriteIds);
      }
      if (portalFilter) {
        if (!portalIds || portalIds.length === 0) return { rows: [], count: 0 };
        query = query.in("id", portalIds);
      }
      if (filters.q) {
        const q = filters.q.replace(/[%,()"\\]/g, " ").trim();
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

  const isLoading = listLoading || (Boolean(portalFilter) && portalIdsLoading);
  const rows = result?.rows ?? [];
  // Coverul fiecărei proprietăți din pagina curentă (is_primary → prima poziție).
  const coverOf = usePropertyCovers(rows.map((r) => r.id));
  // Selecția de portaluri per proprietate (portal_publications) + starea reală (portal_listings).
  // Apare doar dacă Superadmin a activat cel puțin un portal pentru agenție.
  const portals = usePropertyPortals(rows.map((r) => r.id));
  const total = result?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ["properties"] });

  const changeStatusFn = useServerFn(changePropertyStatus);
  const [bulkStatus, setBulkStatus] = useState<"sold" | "rented" | "archived" | null>(null);
  const updateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) =>
      await changeStatusFn({ data: { propertyIds: ids, status: status as never } }),
    onSuccess: (res) => {
      invalidateList();
      setSelected([]);
      setBulkStatus(null);
      queryClient.invalidateQueries({ queryKey: ["property-portals-matrix"] });
      toast.success(
        res.queued > 0
          ? `Statusul a fost actualizat. ${res.queued} retrageri de pe portaluri rulează în fundal.`
          : "Statusul a fost actualizat.",
      );
    },
    onError: (e: Error) => toastError(e),
  });

  const assignAgent = useMutation({
    mutationFn: async ({ ids, agentId }: { ids: string[]; agentId: string }) => {
      /**
       * Reasignarea trece prin server: acolo se verifică locurile de publicare
       * ale noului agent, iar refuzul vine ca mesaj clar, nu ca eroare tehnică.
       */
      const blocked: string[] = [];
      for (const id of ids) {
        const result = await reassignPropertyAgent({ data: { propertyId: id, agentId } });
        if (!result.ok) blocked.push(result.message);
      }
      if (blocked.length > 0) throw new Error(blocked[0]);
    },
    onSuccess: () => {
      invalidateList();
      setSelected([]);
      toast.success("Agent asignat.");
    },
    onError: (e: Error) => {
      invalidateList();
      toastError(e);
    },
  });


  /**
   * Arhivarea trece prin server: acolo se verifică drepturile și condiția de
   * siguranță (nicio proprietate activă pe portaluri sau în Colaborare).
   */
  const archiveMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const failed: string[] = [];
      for (const id of ids) {
        try {
          await archivePropertyFn({ data: { propertyId: id } });
        } catch (e) {
          const row = rows.find((r) => r.id === id);
          failed.push(`${row?.reference ?? id}: ${e instanceof Error ? e.message : "eroare"}`);
        }
      }
      return failed;
    },
    onSuccess: (failed) => {
      invalidateList();
      setSelected([]);
      setArchiveTarget(null);
      if (failed.length > 0) toast.error(failed.join(" · "));
      else toast.success("Proprietăți arhivate.");
    },
    onError: (e: Error) => toastError(e),
  });

  const unarchiveOne = useMutation({
    mutationFn: async (id: string) => await unarchivePropertyFn({ data: { propertyId: id } }),
    onSuccess: () => {
      invalidateList();
      toast.success("Proprietatea a fost readusă în circulație.");
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["property-favorites", user?.userId] }),
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

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.full_name ?? "Nealocat";

  /**
   * Filtrele active, ca pastile închizabile individual. Doar prezentare:
   * fiecare pastilă readuce câmpul la valoarea implicită din `emptyFilters`.
   */
  const activePills: { key: keyof Filters; label: string }[] = [
    filters.q ? { key: "q" as const, label: `„${filters.q}”` } : null,
    filters.status !== "all"
      ? {
          key: "status" as const,
          label:
            propertyStatusLabels[filters.status as keyof typeof propertyStatusLabels] ??
            filters.status,
        }
      : null,
    filters.transaction !== "all"
      ? {
          key: "transaction" as const,
          label: filters.transaction === "sale" ? "Vânzare" : "Închiriere",
        }
      : null,
    filters.type !== "all"
      ? { key: "type" as const, label: propertyTypeLabels[filters.type] ?? filters.type }
      : null,
    filters.city !== "all" ? { key: "city" as const, label: filters.city } : null,
    filters.district !== "all" ? { key: "district" as const, label: filters.district } : null,
    filters.source !== "all" ? { key: "source" as const, label: `Sursă: ${formatPropertySourceLabel(filters.source)}` } : null,
    filters.agent !== "all" ? { key: "agent" as const, label: agentName(filters.agent) } : null,
    filters.mine ? { key: "mine" as const, label: "Doar ale mele" } : null,
    filters.favoritesOnly ? { key: "favoritesOnly" as const, label: "Doar favorite" } : null,
    filters.showArchived ? { key: "showArchived" as const, label: "Include arhivate" } : null,
    portalFilter
      ? { key: "portal" as const, label: portalFilterLabel(filters.portal, portalOptions) }
      : null,
    filters.priceMin ? { key: "priceMin" as const, label: `Preț ≥ ${filters.priceMin}` } : null,
    filters.priceMax ? { key: "priceMax" as const, label: `Preț ≤ ${filters.priceMax}` } : null,
    filters.surfaceMin
      ? { key: "surfaceMin" as const, label: `Supr. ≥ ${filters.surfaceMin} m²` }
      : null,
    filters.surfaceMax
      ? { key: "surfaceMax" as const, label: `Supr. ≤ ${filters.surfaceMax} m²` }
      : null,
    filters.rooms ? { key: "rooms" as const, label: `${filters.rooms} camere` } : null,
    filters.bathrooms ? { key: "bathrooms" as const, label: `${filters.bathrooms} băi` } : null,
    filters.floorMin ? { key: "floorMin" as const, label: `Etaj ≥ ${filters.floorMin}` } : null,
    filters.floorMax ? { key: "floorMax" as const, label: `Etaj ≤ ${filters.floorMax}` } : null,
    filters.addedAfter ? { key: "addedAfter" as const, label: `După ${filters.addedAfter}` } : null,
    filters.addedBefore
      ? { key: "addedBefore" as const, label: `Înainte de ${filters.addedBefore}` }
      : null,
  ].filter(Boolean) as { key: keyof Filters; label: string }[];

  const clearPill = (key: keyof Filters) =>
    setFilters((f) => ({ ...f, [key]: emptyFilters[key] }) as Filters);

  const filtersActive = activePills.length > 0;
  const hiddenFilterKeys: (keyof Filters)[] = [
    "city", "district", "priceMin", "priceMax", "surfaceMin", "surfaceMax", "rooms",
    "bathrooms", "floorMin", "floorMax", "addedAfter", "addedBefore", "agent", "source",
  ];
  const hiddenPills = activePills.filter((pill) => hiddenFilterKeys.includes(pill.key));

  /** Stare goală utilă: fără portofoliu vs. fără rezultate la filtrare. */
  const emptyBlock = filtersActive ? (
    <EmptyState
      icon={Building2}
      title="Nicio proprietate pentru filtrele curente"
      description="Renunță la unul dintre filtrele active sau resetează-le pe toate."
      action={
        <Button size="sm" variant="outline" onClick={() => setFilters(emptyFilters)}>
          <X className="size-4" /> Resetează filtrele
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Building2}
      title="Nicio proprietate în portofoliu"
      description="Adaugă primul anunț, apoi îl poți publica pe portaluri direct din pagina proprietății."
      action={
        <Button asChild size="sm">
          <Link to="/app/properties/new">Adaugă proprietate</Link>
        </Button>
      }
    />
  );

  const saveFilter = () => {
    setPromptRequest({
      title: "Salvează filtrul curent",
      description: "Filtrele active vor fi salvate sub un nume, pentru a le reaplica rapid.",
      label: "Numele filtrului",
      placeholder: "ex. Apartamente 2 camere, Nord",
      confirmLabel: "Salvează",
      onSubmit: (name) =>
        savedViews.save.mutateAsync({
          name,
          config: filters as unknown as Record<string, unknown>,
        }),
    });
  };

  const setDigits = (key: "priceMin" | "priceMax" | "surfaceMin" | "surfaceMax" | "floorMin" | "floorMax", value: string) =>
    setFilters((current) => ({ ...current, [key]: value.replace(/\D/g, "") }));

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
            <Button size="sm" asChild data-tour="property-add">
              <Link to="/app/properties/new">Adaugă proprietate</Link>
            </Button>
          </>
        }
      />

      <div className="panel space-y-5 p-4 sm:p-5">
        <div className="flex flex-col gap-2 border-b border-border md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-4">
          <div role="tablist" aria-label="Tip proprietate" className="flex min-w-0 overflow-x-auto">
            {PROPERTY_TYPE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={filters.type === tab.value}
                onClick={() => setFilters((current) => ({ ...current, type: tab.value }))}
                className={cn(
                  "relative min-h-11 shrink-0 px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground",
                  filters.type === tab.value && "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1 pb-1">
            <Button variant="ghost" size="sm" onClick={toggleFiltersExpanded} aria-expanded={filtersExpanded}>
              <span className="hidden md:inline">{filtersExpanded ? "Mai puține filtre" : "Mai multe filtre"}</span>
              <span className="md:hidden">{filtersExpanded ? "Mai puține filtre" : `Mai multe filtre${hiddenPills.length ? ` (${hiddenPills.length})` : ""}`}</span>
              {filtersExpanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
              <X aria-hidden /> Resetează filtrele
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label htmlFor="property-keywords" className={fieldLabelClass}>Cuvinte cheie / ID</label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
              <Input id="property-keywords" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Titlu, HB-…, adresă" className={cn("pl-9", searchInput && valuedControlClass)} />
            </div>
          </div>
          <fieldset>
            <legend className={fieldLabelClass}>Tranzacție</legend>
            <div className="grid grid-cols-3 overflow-hidden rounded-control border border-input bg-surface">
              {[["all", "Toate"], ["sale", "Vânzare"], ["rent", "Închiriere"]].map(([value, label]) => (
                <Button key={value} type="button" variant="ghost" aria-pressed={filters.transaction === value} onClick={() => setFilters((f) => ({ ...f, transaction: value }))} className={cn("rounded-none border-0 px-2", filters.transaction === value && "bg-sidebar text-surface hover:bg-sidebar hover:text-surface")}>{label}</Button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="property-status" className={fieldLabelClass}>Status</label>
            <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
              <SelectTrigger id="property-status" className={cn("w-full", filters.status !== "all" && valuedControlClass)}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toate statusurile</SelectItem>{Object.entries(propertyStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {portalOptions.length > 0 ? (
            <div>
              <label htmlFor="property-portal" className={fieldLabelClass}>Publicare pe portaluri</label>
              <PortalFilterSelect id="property-portal" value={filters.portal} options={portalOptions} onChange={(v) => setFilters((f) => ({ ...f, portal: v }))} className={cn("w-full", filters.portal !== "all" && valuedControlClass)} />
            </div>
          ) : <div aria-hidden />}

          {shouldShowAdvancedFilters(filtersExpanded) ? <>
            <div>
              <label htmlFor="property-city" className={fieldLabelClass}>Oraș</label>
              <Select value={filters.city} onValueChange={(v) => setFilters((f) => ({ ...f, city: v }))}><SelectTrigger id="property-city" className={cn("w-full", filters.city !== "all" && valuedControlClass)}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toate orașele</SelectItem>{cityOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label} ({option.count})</SelectItem>)}</SelectContent></Select>
            </div>
            <div>
              <label htmlFor="property-district" className={fieldLabelClass}>Zonă</label>
              <Select value={filters.district} onValueChange={(v) => setFilters((f) => ({ ...f, district: v }))}><SelectTrigger id="property-district" className={cn("w-full", filters.district !== "all" && valuedControlClass)}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toate zonele</SelectItem>{districtOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label} ({option.count})</SelectItem>)}</SelectContent></Select>
            </div>
            <fieldset>
              <legend className={fieldLabelClass}>Preț (EUR)</legend>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><Input aria-label="Preț minim" inputMode="numeric" placeholder="Min" value={formatThousands(filters.priceMin)} onChange={(e) => setDigits("priceMin", e.target.value)} className={cn(filters.priceMin && valuedControlClass)} /><span className="text-muted-foreground">–</span><Input aria-label="Preț maxim" inputMode="numeric" placeholder="Max" value={formatThousands(filters.priceMax)} onChange={(e) => setDigits("priceMax", e.target.value)} className={cn(filters.priceMax && valuedControlClass)} /></div>
            </fieldset>
            <fieldset>
              <legend className={fieldLabelClass}>Suprafață utilă (m²)</legend>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><Input aria-label="Suprafață minimă" inputMode="numeric" placeholder="Min" value={formatThousands(filters.surfaceMin)} onChange={(e) => setDigits("surfaceMin", e.target.value)} className={cn(filters.surfaceMin && valuedControlClass)} /><span className="text-muted-foreground">–</span><Input aria-label="Suprafață maximă" inputMode="numeric" placeholder="Max" value={formatThousands(filters.surfaceMax)} onChange={(e) => setDigits("surfaceMax", e.target.value)} className={cn(filters.surfaceMax && valuedControlClass)} /></div>
            </fieldset>
            <fieldset>
              <legend className={fieldLabelClass}>Camere</legend>
              <div className="grid grid-cols-2 gap-1.5">{[["", "Oricâte"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5+", "5+"]].map(([value, label]) => <Button key={value || "any"} type="button" variant="outline" aria-pressed={filters.rooms === value} onClick={() => setFilters((f) => ({ ...f, rooms: value }))} className={cn("px-2", filters.rooms === value && "border-sidebar bg-sidebar text-surface hover:bg-sidebar hover:text-surface")}>{label}</Button>)}</div>
            </fieldset>
            <fieldset>
              <legend className={fieldLabelClass}>Etaj</legend>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><Input aria-label="Etaj minim" inputMode="numeric" placeholder="Min" value={filters.floorMin} onChange={(e) => setDigits("floorMin", e.target.value)} className={cn(filters.floorMin && valuedControlClass)} /><span className="text-muted-foreground">–</span><Input aria-label="Etaj maxim" inputMode="numeric" placeholder="Max" value={filters.floorMax} onChange={(e) => setDigits("floorMax", e.target.value)} className={cn(filters.floorMax && valuedControlClass)} /></div>
            </fieldset>
            <fieldset className="md:col-span-2">
              <legend className={fieldLabelClass}>Adăugată între</legend>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><Input aria-label="Adăugată de la" type="date" value={filters.addedAfter} onChange={(e) => setFilters((f) => ({ ...f, addedAfter: e.target.value }))} className={cn(filters.addedAfter && valuedControlClass)} /><span className="text-muted-foreground">–</span><Input aria-label="Adăugată până la" type="date" value={filters.addedBefore} onChange={(e) => setFilters((f) => ({ ...f, addedBefore: e.target.value }))} className={cn(filters.addedBefore && valuedControlClass)} /></div>
            </fieldset>
            <fieldset>
              <legend className={fieldLabelClass}>Băi</legend>
              <div className="grid grid-cols-4 gap-1.5">{[["", "Oricâte"], ["1", "1"], ["2", "2"], ["3+", "3+"]].map(([value, label]) => <Button key={value || "any"} type="button" variant="outline" aria-pressed={filters.bathrooms === value} onClick={() => setFilters((f) => ({ ...f, bathrooms: value }))} className={cn("px-1", filters.bathrooms === value && "border-sidebar bg-sidebar text-surface hover:bg-sidebar hover:text-surface")}>{label}</Button>)}</div>
            </fieldset>
            {agents.length >= 2 ? <div>
              <label htmlFor="property-agent" className={fieldLabelClass}>Agent</label>
              <Select value={filters.agent} onValueChange={(v) => setFilters((f) => ({ ...f, agent: v }))}><SelectTrigger id="property-agent" className={cn("w-full", filters.agent !== "all" && valuedControlClass)}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toți agenții</SelectItem>{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}</SelectContent></Select>
            </div> : null}
            {(meta?.sources.length ?? 0) >= 2 ? <div>
              <label htmlFor="property-source" className={fieldLabelClass}>Sursă</label>
              <Select value={filters.source} onValueChange={(v) => setFilters((f) => ({ ...f, source: v }))}><SelectTrigger id="property-source" className={cn("w-full", filters.source !== "all" && valuedControlClass)}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toate sursele</SelectItem>{(meta?.sources ?? []).map((s) => <SelectItem key={s} value={s}>{formatPropertySourceLabel(s)}</SelectItem>)}</SelectContent></Select>
            </div> : null}
          </> : null}
        </div>

        {!filtersExpanded && hiddenPills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {hiddenPills.map((pill) => <Button key={String(pill.key)} type="button" variant="ghost" size="sm" onClick={() => clearPill(pill.key)} aria-label={`Renunță la filtrul ${pill.label}`} className="rounded-full bg-sidebar text-surface hover:bg-sidebar hover:text-surface">{pill.label}<X aria-hidden /></Button>)}
          </div>
        ) : null}

        <div className="flex flex-col justify-between gap-4 border-t border-border pt-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className={fieldLabelClass.replace("mb-2 block", "mb-0 inline")}>Afișează</span>
            {[["mine", "Doar ale mele"], ["favoritesOnly", "Doar favorite"], ["showArchived", "Include arhivate"]].map(([key, label]) => {
              const pressed = Boolean(filters[key as "mine" | "favoritesOnly" | "showArchived"]);
              return <Button key={key} type="button" variant="outline" aria-pressed={pressed} onClick={() => setFilters((f) => ({ ...f, [key]: !pressed }))} className={cn("rounded-full", pressed && "border-sidebar bg-sidebar text-surface hover:bg-sidebar hover:text-surface")}>{key === "favoritesOnly" ? <Star aria-hidden /> : key === "showArchived" ? <ArchiveRestore aria-hidden /> : null}{label}</Button>;
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline">Filtre salvate <ChevronDown aria-hidden /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                {savedViews.views.length > 0 ? savedViews.views.map((saved) => <DropdownMenuItem key={saved.id} onSelect={() => setFilters(normalizeSavedPropertyFilters(saved.config))}>{saved.name}</DropdownMenuItem>) : <DropdownMenuItem disabled>Niciun filtru salvat</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={saveFilter}>Salvează filtrul</Button>
          </div>
        </div>

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="text-sm font-medium">{selected.length} selectate</span>
            <Select
              value=""
              onValueChange={(v) =>
                isWithdrawStatus(v) ? setBulkStatus(v) : updateStatus.mutate({ ids: selected, status: v })
              }
            >
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
              Publică pe site
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPortalBulkMode("publish")}>
              Publică pe portaluri…
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPortalBulkMode("withdraw")}>
              Retrage de pe portaluri…
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
        <div className="flex flex-col justify-between gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{total} {total === 1 ? "proprietate" : "proprietăți"}</span>
            {filtersActive ? <span className="text-sm text-muted-foreground">din {portfolioTotal} în portofoliu</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-64"><span className="shrink-0 text-muted-foreground">Sortare:</span><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(sortOptions).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid grid-cols-3 overflow-hidden rounded-control border border-input bg-surface">
              <Button variant="ghost" aria-pressed={view === "list"} onClick={() => setView("list")} className={cn("rounded-none border-0 px-3", view === "list" && "bg-sidebar text-surface hover:bg-sidebar hover:text-surface")}><List aria-hidden /> Listă</Button>
              <Button variant="ghost" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={cn("rounded-none border-0 px-3", view === "grid" && "bg-sidebar text-surface hover:bg-sidebar hover:text-surface")}><LayoutGrid aria-hidden /> Carduri</Button>
              <Button variant="ghost" aria-pressed={view === "publish"} onClick={() => setView("publish")} className={cn("rounded-none border-0 px-3", view === "publish" && "bg-sidebar text-surface hover:bg-sidebar hover:text-surface")}><Send aria-hidden /> Publicare</Button>
            </div>
          </div>
        </div>
        {view === "publish" ? (
          isLoading || portals.isLoading ? <ListSkeleton rows={8} /> : rows.length === 0 ? emptyBlock : (
            <PropertyPublishView
              rows={rows}
              coverOf={coverOf}
              cellsFor={portals.cellsFor}
              drafts={portalDrafts}
              setDrafts={setPortalDrafts}
              organizationId={orgId}
              isAdmin={user?.isAdmin === true}
            />
          )
        ) : view === "list" ? (
          <>
            <div className={cn(
              "hidden items-center gap-[18px] border-b border-border px-[18px] py-3 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase lg:grid",
              portals.hasPortals
                ? "lg:grid-cols-[20px_132px_minmax(0,1fr)_140px_150px_170px_36px]"
                : "lg:grid-cols-[20px_132px_minmax(0,1fr)_140px_170px_36px]",
            )}>
              <Checkbox
                checked={allSelected}
                onCheckedChange={(c) => setSelected(c ? rows.map((r) => r.id) : [])}
                aria-label="Selectează toate proprietățile"
              />
              <span aria-hidden />
              <span>Proprietate</span>
              <span className="text-right">Preț</span>
              {portals.hasPortals ? <span>Portaluri</span> : null}
              <span>Agent</span>
              <span aria-hidden />
            </div>

            {isLoading ? (
              <ListSkeleton rows={8} />
            ) : rows.length === 0 ? (
              emptyBlock
            ) : (
              <ul>
                {rows.map((p) => {
                  const portalCells = portals.cellsFor(p.id);
                  const selectedPortals = portalCells.filter((cell) => cell.selected);
                  const publishedPortals = selectedPortals.filter((cell) => cell.state === "published" || cell.state === "in_feed");
                  const portalError = selectedPortals.find((cell) => cell.state === "error");
                  const promoted = portalCells.some((cell) => cell.promoted);
                  const details = formatPropertyListDetails(p);
                  const price = formatPropertyListPrice(p.price, p.currency, p.transaction_kind, p.surface);
                  const permittedDelete = canShowDeleteAction(canDeleteProperty(user, p));
                  return (
                  <li
                    key={p.id}
                    className={cn(
                      "relative grid grid-cols-2 items-center gap-[18px] border-b border-border px-[18px] py-[14px] text-sm transition-colors last:border-b-0 hover:bg-accent/40 lg:grid-cols-[20px_132px_minmax(0,1fr)_140px_170px_36px]",
                      portals.hasPortals && "lg:grid-cols-[20px_132px_minmax(0,1fr)_140px_150px_170px_36px]",
                      selected.includes(p.id) && "bg-accent hover:bg-accent",
                    )}
                  >
                    <Checkbox
                      checked={selected.includes(p.id)}
                      onCheckedChange={(c) =>
                        setSelected((s) => (c ? [...s, p.id] : s.filter((id) => id !== p.id)))
                      }
                      aria-label={`Selectează ${p.reference ?? p.title}`}
                      className="absolute top-5 right-16 z-10 bg-surface lg:static"
                    />
                    <div className="relative col-span-2 aspect-[16/10] w-full lg:col-span-1 lg:h-24 lg:w-[132px] lg:aspect-auto">
                      <PropertyThumb
                        propertyId={p.id}
                        title={p.title}
                        cover={coverOf(p.id)}
                        className="size-full rounded-xl"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleFavorite.mutate(p.id)}
                        aria-label={favoriteIds.includes(p.id) ? "Elimină din favorite" : "Adaugă la favorite"}
                        className="absolute top-2 left-2 size-[30px] min-h-0 rounded-full border border-border bg-surface shadow-sm hover:bg-surface"
                      >
                        <Star className={cn("size-4 text-muted-foreground", favoriteIds.includes(p.id) && "fill-warning text-warning")} />
                      </Button>
                      {promoted ? <span className="absolute bottom-2 left-2 rounded-pill bg-sidebar px-2 py-1 text-[11px] font-bold text-sidebar-primary">Promovat</span> : null}
                    </div>
                    <div className="col-span-2 min-w-0 lg:col-span-1">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={propertyStatusTone[p.status]} dot className="text-xs">{propertyStatusLabels[p.status]}</StatusBadge>
                        <span className={cn("rounded-pill px-2.5 py-0.5 text-xs font-bold", p.transaction_kind === "rent" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{transactionLabels[p.transaction_kind]}</span>
                        <span className="rounded-pill border border-border px-2.5 py-0.5 text-xs font-bold text-muted-foreground">{propertyTypeLabels[p.property_type] ?? p.property_type}</span>
                      </div>
                      <Link
                        to="/app/properties/$id"
                        params={{ id: p.id }}
                        className="line-clamp-2 text-[15px] leading-5 font-bold hover:text-primary"
                      >
                        {p.title}
                      </Link>
                      {details ? <p className="mt-1 truncate text-[13px] text-muted-foreground">{details}</p> : null}
                    </div>
                    <div className="col-span-2 text-left lg:col-span-1 lg:text-right">
                      <p className="font-display text-[21px] leading-tight font-semibold">{price.main}{price.suffix ? <span className="ml-1 font-sans text-xs font-normal text-muted-foreground">{price.suffix}</span> : null}</p>
                      {price.perSquareMeter ? <p className="mt-1 text-xs text-muted-foreground">{price.perSquareMeter}</p> : null}
                    </div>
                    {portals.hasPortals ? (
                      <div className="min-w-0 self-end lg:self-center">
                        {selectedPortals.length > 0 ? <div className="flex flex-wrap gap-1.5">{selectedPortals.map((cell) => (
                          <Tooltip key={cell.portalId}>
                            <TooltipTrigger asChild>
                              <span className="relative inline-flex rounded-lg border border-border bg-surface p-1">
                                <PortalLogoStack portalId={cell.portalId} name={cell.portalName} size={24} />
                                <span className={cn("absolute right-0 bottom-0 size-[11px] rounded-full border-2 border-surface", {
                                  "bg-success": portalDotTone(cell.state) === "success",
                                  "bg-warning": portalDotTone(cell.state) === "warning",
                                  "bg-destructive": portalDotTone(cell.state) === "danger",
                                  "bg-muted-foreground": portalDotTone(cell.state) === "neutral",
                                })} />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{cell.portalName}: {portalStateLabel(cell.state)}</TooltipContent>
                          </Tooltip>
                        ))}</div> : null}
                        {portalError ? <p className="mt-1.5 truncate text-xs font-semibold text-destructive">Eroare pe {portalError.portalName}</p> : publishedPortals.length > 0 ? <p className="mt-1.5 text-xs font-semibold text-success">Publicat pe {publishedPortals.length} {publishedPortals.length === 1 ? "portal" : "portaluri"}</p> : <p className="mt-1.5 text-xs text-muted-foreground">Nepublicată · <a href={`/app/properties/${p.id}?tab=publishing`} className="font-semibold text-primary hover:underline">Publică pe portaluri</a></p>}
                      </div>
                    ) : null}
                    <div className="flex min-w-0 items-center gap-2 self-end lg:self-center">
                      <UserAvatar name={agentName(p.assigned_to)} className="size-8 bg-sidebar text-sidebar-foreground" textClassName="text-xs font-bold" />
                      <div className="min-w-0"><p className="truncate text-[13px] font-semibold">{agentName(p.assigned_to)}</p><p className="truncate text-xs text-muted-foreground">Actualizat {relativeDays(p.updated_at)}</p></div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Acțiuni pentru ${p.reference ?? p.title}`} className="absolute top-5 right-6 size-9 border border-transparent hover:border-border focus-visible:border-border lg:static">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link to="/app/properties/$id" params={{ id: p.id }}><ExternalLink /> Deschide</Link></DropdownMenuItem>
                        <DropdownMenuItem asChild><a href={`/app/properties/${p.id}?edit=true`}><Pencil /> Editează</a></DropdownMenuItem>
                        <DropdownMenuItem asChild><a href={`/app/properties/${p.id}?tab=publishing`}><ExternalLink /> Publicare pe portaluri</a></DropdownMenuItem>
                        {p.status === "archived" ? <DropdownMenuItem disabled={unarchiveOne.isPending} onSelect={() => unarchiveOne.mutate(p.id)}><ArchiveRestore /> Dezarhivează</DropdownMenuItem> : null}
                        {permittedDelete ? <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(p.id)}><Trash2 /> Șterge</DropdownMenuItem> : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : isLoading ? (
          <CardGridSkeleton count={6} className="p-4" />
        ) : rows.length === 0 ? (
          emptyBlock
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map((p) => (
              <PropertyCard
                key={p.id}
                property={p as unknown as PropertyCardRow}
                cover={coverOf(p.id)}
                favorite={favoriteIds.includes(p.id)}
                onToggleFavorite={() => toggleFavorite.mutate(p.id)}
                selected={selected.includes(p.id)}
                onSelectedChange={(next) =>
                  setSelected((s) => (next ? [...s, p.id] : s.filter((id) => id !== p.id)))
                }
                portalCells={portals.hasPortals ? portals.cellsFor(p.id) : []}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
          <span className="text-xs text-muted-foreground">
            {total > 0
              ? `Rezultate ${page * PAGE_SIZE + 1}–${Math.min(total, (page + 1) * PAGE_SIZE)} din ${total}`
              : "Rezultate 0 din 0"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Pagina anterioară"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
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

      <StatusChangeDialog
        propertyIds={selected}
        status={bulkStatus}
        statusLabel={bulkStatus ? (propertyStatusLabels[bulkStatus] ?? bulkStatus) : ""}
        pending={updateStatus.isPending}
        onCancel={() => setBulkStatus(null)}
        onConfirm={() => bulkStatus && updateStatus.mutate({ ids: selected, status: bulkStatus })}
      />
      <AlertDialog open={archiveTarget !== null} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arhivezi proprietățile selectate?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.length} proprietăți vor fi marcate ca arhivate. Poți reveni oricând
              asupra statusului.
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

      <DeletePropertyDialog
        propertyId={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onDeleted={() => {
          setSelected((s) => s.filter((x) => x !== deleteTarget));
          setDeleteTarget(null);
        }}
      />
      <PromptDialog request={promptRequest} onClose={() => setPromptRequest(null)} />
      <PortalBulkSelectionDialog
        mode={portalBulkMode}
        propertyIds={selected}
        cellsFor={portals.cellsFor}
        organizationId={orgId}
        onClose={() => setPortalBulkMode(null)}
        onStarted={(jobId) => {
          setPortalBulkJobId(jobId);
          setSelected([]);
        }}
      />
      <PortalBulkProgress jobId={portalBulkJobId} />
    </>
  );
}
