import { SendOfferDialog } from "@/components/app/SendOfferDialog";
import { SendCollaboratorOfferDialog } from "@/components/app/SendCollaboratorOfferDialog";
import { neutralOfferReason } from "@/lib/neutral-offer";
import { offerSendReason } from "@/lib/offer-client";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { SearchPlacesPicker } from "@/components/app/SearchPlacesPicker";
import { buildSearchPlaces, legacyPlaceChoices, parsePlaceChoices, serializePlaces } from "@/lib/search-places";
import { StatusChangeDialog } from "@/components/app/StatusChangeDialog";
import { isWithdrawStatus } from "@/components/app/StatusWithdrawPreview";
import { changePropertyStatus } from "@/lib/property-status.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_LIST_PAGE_SIZE, normalizeListPageSize, type ListPageSize } from "@/lib/list-page-size";
import { ListPagination, PageRange, PageSizeSelect } from "@/components/app/ListPagination";
import {
  ArchiveRestore,
  Trash2,
  Building2,
  ChevronDown,
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
import { promotionFilterLabel, parsePromotionValues } from "@/components/app/PromotionFilterSelect";
import { getPortalFilterOptions, getPropertyIdsByPortalState } from "@/lib/portals.functions";
import {
  getPromotionFilterOptions,
  getPropertyIdsByPromotion,
  getPropertyPromotionBadges,
} from "@/lib/portals/promotion-filter.functions";
import { parsePortalFilter } from "@/lib/portals/portal-state";
import { portalListingLink } from "@/lib/portals/listing-links";
import { PropertyCard, type PropertyCardRow } from "@/components/app/PropertyCard";
import { PropertyFilterPanel } from "@/components/app/PropertyFilterPanel";
import { applyPropertyFilterClauses } from "@/lib/property-filter-query";
import { useServerFn } from "@tanstack/react-start";
import { archiveProperty, unarchiveProperty } from "@/lib/property-archive.functions";
import { ReassignPropertiesDialog } from "@/components/app/ReassignPropertiesDialog";
import { PropertyThumb, usePropertyCovers } from "@/components/app/PropertyThumb";
import { PropertyPublishView } from "@/components/app/PropertyPublishView";
import { trackPortalBulkJob } from "@/components/app/PortalBulkProgress";
import { PortalBulkSelectionDialog } from "@/components/app/PortalBulkSelectionDialog";
import { PortalRepublishButton } from "@/components/app/PortalRepublishDialog";
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
import { useListState } from "@/hooks/use-list-state";
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
import { announceGuideContext } from "@/lib/onboarding-tour";
import { cn } from "@/lib/utils";
import { canShowDeleteAction, formatPropertyListDetails, formatPropertyListPrice, portalDotTone, portalStateLabel } from "@/lib/property-list-row";
import { agentFilterClause, buildAgentFilterOptions, showMainAgentFilter, UNASSIGNED_AGENT_FILTER } from "@/lib/property-list-filters";
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
  selectedStatuses,
  type PropertyListFilters,
  type PropertyListSort,
  type PropertyListView,
} from "@/lib/property-list-filters";
import type { BulkDraft } from "@/lib/portals/bulk";

export const Route = createFileRoute("/_authenticated/app/properties/")({
  validateSearch: (search) => propertyListSearchSchema.parse(search),
  head: () => { const title = "Habitoo CRM — proprietăți"; const description = "Proprietățile agenției, filtre, paginare și publicare pe portaluri."; const head = appHead(title); return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  component: PropertiesPage,
});

type Filters = PropertyListFilters;
const emptyFilters = emptyPropertyListFilters;

type SortKey = PropertyListSort;

const sortOptions: Record<SortKey, string> = {
  created_desc: "Data introducerii (desc.)",
  updated_desc: "Data modificării (desc.)",
  price_asc: "Preț (cresc.)",
  price_desc: "Preț (desc.)",
  surface_asc: "Suprafață (cresc.)",
  surface_desc: "Suprafață (desc.)",
};



function PropertiesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const urlState = propertyListStateFromSearch(search);
  const filters = urlState.filters;
  const sort = urlState.sort;
  const page = urlState.page - 1;
  const PAGE_SIZE = normalizeListPageSize(search.perPagina);
  const view = urlState.view;
  const urlStateRef = useRef(urlState);
  urlStateRef.current = urlState;
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  // Ghidul „Unelte din listă” pornește o singură dată: la prima vedere schimbată sau prima selecție.
  const toolsAnnounced = useRef(false);
  const announceTools = () => { if (!toolsAnnounced.current) { toolsAnnounced.current = true; announceGuideContext("properties:tools"); } };
  useEffect(() => { if (selected.length > 0) announceTools(); }, [selected.length]);
  const [sendOfferTarget, setSendOfferTarget] = useState<string | null>(null);
  const [collaboratorOfferTarget, setCollaboratorOfferTarget] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<string[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  const [portalDrafts, setPortalDrafts] = useState<Record<string, BulkDraft>>({});
  const [portalBulkMode, setPortalBulkMode] = useState<"publish" | "withdraw" | null>(null);
  const archivePropertyFn = useServerFn(archiveProperty);
  const unarchivePropertyFn = useServerFn(unarchiveProperty);

  const savedViews = useSavedViews("properties", orgId, user?.userId);


  const writeUrlState = (
    nextFilters: Filters,
    nextSort = sort,
    nextPage = 1,
    nextView = view,
    replace = false,
    nextPageSize: number | undefined = search.perPagina,
  ) => navigate({
    search: { ...propertyListSearchFromState(nextFilters, nextSort, nextPage, nextView), perPagina: nextPageSize },
    replace,
  });
  const confirmDiscardDrafts = () => {
    if (view !== "publish" || Object.keys(portalDrafts).length === 0) return true;
    if (!window.confirm(`Renunți la ${Object.keys(portalDrafts).length} modificări?`)) return false;
    setPortalDrafts({});
    return true;
  };

  const setFilters = (updater: Filters | ((current: Filters) => Filters)) => {
    const next = typeof updater === "function" ? updater(filters) : updater;
    void writeUrlState(next);
  };

  const setSort = (nextSort: SortKey) => void writeUrlState(filters, nextSort);
  const setView = (nextView: PropertyListView) => {
    announceTools();
    if (nextView !== "publish" && view === "publish" && Object.keys(portalDrafts).length > 0) {
      if (!window.confirm(`Renunți la ${Object.keys(portalDrafts).length} modificări?`)) return;
      setPortalDrafts({});
    }
    void writeUrlState(filters, sort, urlState.page, nextView);
  };
  const setPage = (updater: number | ((current: number) => number)) => {
    const nextZeroBased = typeof updater === "function" ? updater(page) : updater;
    if (!confirmDiscardDrafts()) return;
    setSelected([]);
    void writeUrlState(filters, sort, nextZeroBased + 1, view);
  };
  const applyPageSize = useCallback(
    (size: ListPageSize) => {
      const latest = urlStateRef.current;
      void navigate({
        search: { ...propertyListSearchFromState(latest.filters, latest.sort, 1, latest.view), perPagina: size === DEFAULT_LIST_PAGE_SIZE ? undefined : size },
        replace: true,
      });
    },
    [navigate],
  );
  const clearListState = useListState({ list: "properties", userId: user?.userId, search,
    apply: (saved) => { const parsed = propertyListSearchSchema.safeParse(saved); if (parsed.success) void navigate({ search: parsed.data, replace: true, resetScroll: false }); },
  });
  const resetFilters = () => {
    if (!confirmDiscardDrafts()) return;
    clearListState(); setSelected([]);
    void navigate({ search: {}, replace: true });
  };
  const changePageSize = (size: ListPageSize) => {
    if (!confirmDiscardDrafts()) return;
    setSelected([]);
    applyPageSize(size);
  };

  useBlocker({
    disabled: Object.keys(portalDrafts).length === 0,
    enableBeforeUnload: true,
    shouldBlockFn: ({ current, next }) => {
      if (current.pathname === next.pathname) return false;
      return !window.confirm(`Renunți la ${Object.keys(portalDrafts).length} modificări?`);
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["profiles", "org", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,is_active")
        .eq("organization_id", orgId as string)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // Filtrul principal „Agent”: doar pentru cine vede toate anunțurile agenției.
  const mainAgentFilter = showMainAgentFilter(user);
  const { data: agentListingRows = [] } = useQuery({
    queryKey: ["property-agent-counts", orgId],
    enabled: Boolean(orgId) && mainAgentFilter,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("assigned_to,status,deleted_at")
        .eq("organization_id", orgId as string)
        .is("deleted_at", null)
        .neq("status", "archived")
        .limit(10000);
      if (error) throw error;
      return data;
    },
  });
  const agentOptions = useMemo(
    () => buildAgentFilterOptions(agents, agentListingRows),
    [agents, agentListingRows],
  );

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
      const data: { city: string | null; county: string | null; district: string | null; source: string | null; destination: string | null }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: batch, error } = await supabase.from("properties").select("city,county,district,source,destination").eq("organization_id", orgId as string).is("deleted_at", null).order("id").range(offset, offset + 999);
        if (error) throw error;
        data.push(...(batch ?? []));
        if ((batch?.length ?? 0) < 1000) break;
      }
      return {
        rows: data,
        sources: [...new Set(data.map((p) => p.source).filter(Boolean) as string[])].sort(),
        destinations: [...new Set(data.map((p) => p.destination?.trim()).filter(Boolean) as string[])].sort((x, y) => x.localeCompare(y, "ro")),
      };
    },
  });

  const placeOptions = useMemo(() => buildSearchPlaces(meta?.rows ?? []), [meta?.rows]);
  const placeValue = filters.locuri || serializePlaces(legacyPlaceChoices(undefined, filters.city, filters.district));

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

  // Filtrul „Promovare”: opțiunile vin din registru, doar pentru portalurile
  // conectate; id-urile se rezolvă pe server, apoi interogarea listei (sub RLS)
  // le intersectează — agentul vede în continuare doar anunțurile lui.
  const loadPromotionOptions = useServerFn(getPromotionFilterOptions);
  const loadPromotionIds = useServerFn(getPropertyIdsByPromotion);
  const loadPromotionBadges = useServerFn(getPropertyPromotionBadges);
  const { data: promotionGroups = [] } = useQuery({
    queryKey: ["promotion-filter-options", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => (await loadPromotionOptions({ data: { organizationId: orgId } })).groups,
  });
  const promotionValues = useMemo(() => {
    const valid = new Set([
      "any",
      "none",
      ...promotionGroups.flatMap((group) => group.options.map((option) => option.value)),
    ]);
    return parsePromotionValues(filters.promotion).filter((value) => valid.has(value));
  }, [filters.promotion, promotionGroups]);
  const { data: promotionIds, isLoading: promotionIdsLoading } = useQuery({
    queryKey: ["promotion-filter-ids", orgId, promotionValues],
    enabled: Boolean(orgId) && promotionValues.length > 0,
    queryFn: () => loadPromotionIds({ data: { organizationId: orgId, values: promotionValues } }),
  });

  const { data: result, isLoading: listLoading } = useQuery({
    // (isLoading de mai jos combină și încărcarea filtrelor de portaluri/promovare)
    queryKey: ["properties", orgId, filters, sort, page, PAGE_SIZE, favoriteIds, portalIds, promotionIds],
    enabled:
      Boolean(orgId) &&
      (!portalFilter || portalIds !== undefined) &&
      (promotionValues.length === 0 || promotionIds !== undefined),
    queryFn: async () => {
      const choices = parsePlaceChoices(placeValue);
      let query = (choices.length ? supabase.rpc("search_properties_places", { _choices: choices }, { count: "exact" }) : supabase.from("properties"))
        .select("*", { count: "exact" })
        .eq("organization_id", orgId as string)
        .is("deleted_at", null);

      query = applyPropertyFilterClauses(query as never, filters, {
        agentClause: mainAgentFilter ? agentFilterClause(filters.agent) : { kind: "none" },
        userId: user?.userId,
      }) as typeof query;
      if (filters.favoritesOnly) {
        if (favoriteIds.length === 0) return { rows: [], count: 0 };
        query = query.in("id", favoriteIds);
      }
      if (portalFilter) {
        if (!portalIds || portalIds.length === 0) return { rows: [], count: 0 };
        query = query.in("id", portalIds);
      }
      if (promotionValues.length > 0) {
        if (!promotionIds || promotionIds.length === 0) return { rows: [], count: 0 };
        query = query.in("id", promotionIds);
      }
      const { col, asc } = sortColumn[sort];
      query = query.order(col, { ascending: asc, nullsFirst: false }).order("id");
      query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });

  const isLoading =
    listLoading ||
    (Boolean(portalFilter) && portalIdsLoading) ||
    (promotionValues.length > 0 && promotionIdsLoading);
  const rows = result?.rows ?? [];
  // Etichetele „Promovat” (portal · serviciu) pentru rândurile din pagina curentă.
  const { data: promotionBadges = {} } = useQuery({
    queryKey: ["property-promotion-badges", orgId, rows.map((r) => r.id)],
    enabled: Boolean(orgId) && rows.length > 0,
    queryFn: () =>
      loadPromotionBadges({ data: { organizationId: orgId, propertyIds: rows.map((r) => r.id) } }),
  });
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

  const [reassignOpen, setReassignOpen] = useState(false);


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
    filters.statuses ? { key: "statuses" as const, label: `Valabilitate: ${selectedStatuses(filters).length} selectate` } : null,
    filters.tab !== "all" ? { key: "tab" as const, label: PROPERTY_TYPE_TABS.find((t) => t.value === filters.tab)?.label ?? filters.tab } : null,
    filters.street ? { key: "street" as const, label: `Stradă: ${filters.street}` } : null,
    filters.destination !== "all" ? { key: "destination" as const, label: `Destinație: ${filters.destination}` } : null,
    filters.updatedAfter ? { key: "updatedAfter" as const, label: `Modificat după ${filters.updatedAfter}` } : null,
    filters.updatedBefore ? { key: "updatedBefore" as const, label: `Modificat înainte de ${filters.updatedBefore}` } : null,
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
    mainAgentFilter && filters.agent !== "all"
      ? { key: "agent" as const, label: filters.agent === UNASSIGNED_AGENT_FILTER ? "Nealocate" : agentName(filters.agent) }
      : null,
    filters.mine ? { key: "mine" as const, label: "Doar ale mele" } : null,
    filters.favoritesOnly ? { key: "favoritesOnly" as const, label: "Doar favorite" } : null,
    portalFilter
      ? { key: "portal" as const, label: portalFilterLabel(filters.portal, portalOptions) }
      : null,
    filters.promotion
      ? {
          key: "promotion" as const,
          label: `Promovare: ${promotionFilterLabel(filters.promotion, promotionGroups)}`,
        }
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

  const filtersActive = activePills.length > 0 || Boolean(filters.locuri);

  /** Stare goală utilă: fără portofoliu vs. fără rezultate la filtrare. */
  const emptyBlock = filtersActive ? (
    <EmptyState
      icon={Building2}
      title="Nicio proprietate pentru filtrele curente"
      description="Renunță la unul dintre filtrele active sau resetează-le pe toate."
      action={
        <Button size="sm" variant="outline" onClick={resetFilters}>
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


  return (
    <>
      <PageHeader
        title="Proprietăți"
        description="Portofoliul agenției, cu filtrare avansată, editare rapidă și acțiuni în masă."
        actions={
          <>
            <PortalRepublishButton organizationId={orgId} reportBatchId={search.republicare} />
            <Button variant="outline" size="sm" onClick={exportCsv} data-tour="properties-export">
              <Download className="size-4" /> Export CSV
            </Button>
            <Button size="sm" asChild data-tour="property-add">
              <Link to="/app/properties/new">Adaugă proprietate</Link>
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <PropertyFilterPanel
          applied={filters}
          placeValue={placeValue}
          onApply={(next) => { if (!confirmDiscardDrafts()) return; setSelected([]); void writeUrlState(next); }}
          onTab={(tab) => setFilters((current) => ({ ...current, tab, type: "all" }))}
          onReset={resetFilters}
          placeOptions={placeOptions}
          showAgent={mainAgentFilter}
          agentOptions={agentOptions}
          portalOptions={portalOptions}
          promotionGroups={promotionGroups}
          sources={meta?.sources ?? []}
          destinations={meta?.destinations ?? []}
          savedLinks={<>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" data-tour="properties-saved-views" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">Filtre salvate <ChevronDown className="size-3.5" aria-hidden /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                {savedViews.views.length > 0 ? savedViews.views.map((saved) => <DropdownMenuItem key={saved.id} onSelect={() => setFilters(normalizeSavedPropertyFilters(saved.config))}>{saved.name}</DropdownMenuItem>) : <DropdownMenuItem disabled>Niciun filtru salvat</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="button" onClick={saveFilter} className="text-sm text-muted-foreground hover:text-foreground">Salvează filtrul</button>
          </>}
        />

        {activePills.length > 0 ? (
          <div className="flex flex-wrap gap-2 md:hidden">
            {activePills.map((pill) => <Button key={String(pill.key)} type="button" variant="ghost" size="sm" onClick={() => clearPill(pill.key)} aria-label={`Renunță la filtrul ${pill.label}`} className="rounded-full bg-sidebar text-surface hover:bg-sidebar hover:text-surface">{pill.label}<X aria-hidden /></Button>)}
          </div>
        ) : null}

        <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div data-tour="properties-views" className="inline-flex w-fit overflow-hidden rounded-[4px] border border-border bg-muted">
            {([["list", "Afișare în Listă", List], ["grid", "Carduri", LayoutGrid], ["publish", "Publicare", Send]] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" data-tour={key === "publish" ? "properties-view-publish" : undefined} aria-pressed={view === key} onClick={() => setView(key)} className={cn("inline-flex h-10 items-center gap-2 border-r border-border px-4 text-[15px] last:border-r-0", view === key ? "bg-foreground/10 font-medium text-foreground" : "text-foreground/80 hover:bg-foreground/5")}>
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <div className="justify-self-start rounded-full border border-border bg-surface px-8 py-2 text-[15px] text-foreground/80 md:justify-self-center">
            Pagina {Math.min(page + 1, totalPages)}/{totalPages}, {total} rezultate
          </div>
          <div data-tour="properties-order" className="flex items-center gap-2 justify-self-start md:justify-self-end">
            <PageSizeSelect value={PAGE_SIZE} onChange={changePageSize} />
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger aria-label="Sortare" className="h-10 w-auto gap-2 rounded-[4px] border-border bg-surface px-4 text-[15px] shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(sortOptions).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {selected.length > 0 ? (
          <div data-tour="properties-selection" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
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
            {user?.isAdmin ? (
              <Button variant="outline" onClick={() => setReassignOpen(true)}>
                Realocă la…
              </Button>
            ) : null}
            <ReassignPropertiesDialog
              open={reassignOpen}
              onOpenChange={setReassignOpen}
              title={`Realocă ${selected.length} anunțuri`}
              candidates={agents}
              loadIds={async () => selected}
              onDone={() => {
                invalidateList();
                setSelected([]);
              }}
            />
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

      <div data-tour="properties-results" className="panel overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-baseline gap-2">
            <span className="whitespace-nowrap font-semibold">{total} {total === 1 ? "proprietate" : "proprietăți"}</span>
            <span className="whitespace-nowrap text-sm text-muted-foreground"><PageRange page={page + 1} pageSize={PAGE_SIZE} total={total} /></span>
            {filtersActive ? <span className="text-sm text-muted-foreground">din {portfolioTotal} în portofoliu</span> : null}
          </div>
        </div>
        {totalPages > 1 ? (
          <div className="border-b border-border px-4 py-3">
            <ListPagination page={page + 1} pages={totalPages} onGo={(p) => setPage(p - 1)} />
          </div>
        ) : null}
        {view === "publish" ? (
          isLoading || portals.isLoading ? <ListSkeleton rows={8} /> : rows.length === 0 ? emptyBlock : (
            <PropertyPublishView
              rows={rows}
              coverOf={coverOf}
              cellsFor={portals.cellsFor}
              contactBlockOf={portals.contactBlockOf}
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
                  const propertyPromotionBadges = promotionBadges[p.id] ?? [];
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
                    </div>
                    <div className="col-span-2 min-w-0 lg:col-span-1">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={propertyStatusTone[p.status]} dot className="text-xs">{propertyStatusLabels[p.status]}</StatusBadge>
                        <span className={cn("rounded-pill px-2.5 py-0.5 text-xs font-bold", p.transaction_kind === "rent" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{transactionLabels[p.transaction_kind]}</span>
                        <span className="rounded-pill border border-border px-2.5 py-0.5 text-xs font-bold text-muted-foreground">{propertyTypeLabels[p.property_type] ?? p.property_type}</span>
                        {propertyPromotionBadges.map((badge) => (
                          <span key={badge.label} className="rounded-pill bg-sidebar px-2.5 py-0.5 text-xs font-bold text-sidebar-primary">{badge.label}</span>
                        ))}
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
                        {selectedPortals.length > 0 ? <div className="flex flex-wrap gap-1.5">{selectedPortals.map((cell) => {
                          const link = portalListingLink(cell);
                          const logoBox = (
                            <>
                              <PortalLogoStack portalId={cell.portalId} name={cell.portalName} size={24} />
                              <span className={cn("absolute right-0 bottom-0 size-[11px] rounded-full border-2 border-surface", {
                                "bg-success": portalDotTone(cell.state) === "success",
                                "bg-warning": portalDotTone(cell.state) === "warning",
                                "bg-destructive": portalDotTone(cell.state) === "danger",
                                "bg-muted-foreground": portalDotTone(cell.state) === "neutral",
                              })} />
                            </>
                          );
                          return (
                          <Tooltip key={cell.portalId}>
                            <TooltipTrigger asChild>
                              {link.href ? (
                                <a
                                  href={link.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Vezi anunțul pe ${cell.portalName}`}
                                  className="relative inline-flex rounded-lg border border-border bg-surface p-1 transition-colors hover:border-primary"
                                >
                                  {logoBox}
                                </a>
                              ) : (
                                <span className="relative inline-flex rounded-lg border border-border bg-surface p-1">
                                  {logoBox}
                                </span>
                              )}
                            </TooltipTrigger>
                            <TooltipContent>{link.tooltip ?? `${cell.portalName}: ${portalStateLabel(cell.state)}`}</TooltipContent>
                          </Tooltip>
                          );
                        })}</div> : null}
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
                        <DropdownMenuItem disabled={Boolean(offerSendReason(p))} title={offerSendReason(p) ?? undefined} onSelect={() => setSendOfferTarget(p.id)}><Send /> Trimite oferta</DropdownMenuItem>
                        <DropdownMenuItem disabled={Boolean(neutralOfferReason(p))} title={neutralOfferReason(p) ?? undefined} onSelect={() => setCollaboratorOfferTarget(p.id)}><Send /> Trimite unui colaborator</DropdownMenuItem>
                        {offerSendReason(p) ? <p className="max-w-64 px-2 py-1 text-xs text-muted-foreground">{offerSendReason(p)}</p> : null}
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

        <div className="border-t border-border px-4 py-3">
          <ListPagination page={page + 1} pages={totalPages} onGo={(p) => setPage(p - 1)} />
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
      {sendOfferTarget ? <SendOfferDialog propertyId={sendOfferTarget} open onOpenChange={open => !open && setSendOfferTarget(null)} /> : null}
      {collaboratorOfferTarget ? <SendCollaboratorOfferDialog propertyId={collaboratorOfferTarget} open onOpenChange={open => !open && setCollaboratorOfferTarget(null)} /> : null}
      <PromptDialog request={promptRequest} onClose={() => setPromptRequest(null)} />
      <PortalBulkSelectionDialog
        mode={portalBulkMode}
        propertyIds={selected}
        cellsFor={portals.cellsFor}
        contactBlockOf={portals.contactBlockOf}
        isAdmin={user?.isAdmin === true}
        organizationId={orgId}
        onClose={() => setPortalBulkMode(null)}
        onStarted={(jobId) => {
          trackPortalBulkJob(jobId);
          setSelected([]);
        }}
      />
    </>
  );
}
