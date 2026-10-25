/**
 * Tabul „Argus” din Anunțuri particulari: căutare live la Argus cu filtrele
 * traduse în parametrii API. Anunțurile nu se salvează în baza de date;
 * telefonul se cere doar la apăsarea „Arată telefon”; aceeași căutare
 * repetată în 5 minute se servește din cache (ARGUS_CACHE_MS).
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  MapPin,
  Phone,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getArgusListingContact,
  getArgusListingDetail,
  getArgusListingImages,
  getArgusLocations,
  getArgusPropertyTypes,
  getArgusTabStatus,
  searchArgusListings,
} from "@/lib/argus/argus.functions";
import {
  ARGUS_CACHE_MS,
  type ArgusPlace,
  type ArgusPropertyCard,
  type ArgusSearchInput,
} from "@/lib/argus/search.shared";
import { cn } from "@/lib/utils";

const ALL = "__all";
const ROOM_OPTIONS = [1, 2, 3, 4, 5];
/** Câte rezultate presupunem pe pagină la Argus, pentru paginare. */
const ARGUS_PAGE_SIZE = 20;

function money(value: number | null) {
  if (value === null) return "Preț nespecificat";
  try {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} EUR`;
  }
}

const parseNum = (text: string): number | undefined => {
  const n = Number(text.replace(/[^\d-]/g, ""));
  return text.trim() && Number.isFinite(n) ? n : undefined;
};

export function ArgusTab() {
  const fetchStatus = useServerFn(getArgusTabStatus);
  const status = useQuery({
    queryKey: ["argus-tab-status"],
    queryFn: () => fetchStatus(),
    staleTime: 60_000,
  });

  if (status.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (!status.data?.connected) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
        <SearchX className="size-8 text-muted-foreground" />
        <p className="font-medium">Argus nu este conectat pentru agenția ta</p>
        <p className="text-sm text-muted-foreground">
          Conectează Argus din{" "}
          <Link
            to="/app/settings"
            search={{ tab: "integrations" }}
            className="font-medium text-primary underline"
          >
            Setări → Integrări
          </Link>
          .
        </p>
      </div>
    );
  }

  return <ArgusSearch />;
}

/* ------------------------------------------------------------------ */
/* Filtre                                                               */
/* ------------------------------------------------------------------ */

type Draft = {
  transaction: string;
  county: ArgusPlace | null;
  city: ArgusPlace | null;
  areas: ArgusPlace[];
  propertyType: string;
  rooms: number[];
  priceMin: string;
  priceMax: string;
  surfaceMin: string;
  surfaceMax: string;
  listedBy: "owner" | "all";
};

const EMPTY_DRAFT: Draft = {
  transaction: "",
  county: null,
  city: null,
  areas: [],
  propertyType: "",
  rooms: [],
  priceMin: "",
  priceMax: "",
  surfaceMin: "",
  surfaceMax: "",
  listedBy: "owner",
};

type Applied = ArgusSearchInput & { page: number };

function toApplied(draft: Draft, page: number): Applied {
  return {
    page,
    transaction: (draft.transaction || undefined) as Applied["transaction"],
    propertyType: draft.propertyType ? Number(draft.propertyType) : undefined,
    rooms: draft.rooms.length ? draft.rooms : undefined,
    priceMin: parseNum(draft.priceMin),
    priceMax: parseNum(draft.priceMax),
    surfaceMin: parseNum(draft.surfaceMin),
    surfaceMax: parseNum(draft.surfaceMax),
    countyId: draft.county?.id,
    cityId: draft.city?.id,
    areaIds: draft.areas.length ? draft.areas.map((a) => a.id) : undefined,
    listedBy: draft.listedBy,
  };
}

/** Combobox cu căutare pentru județe și localități Argus. */
function PlaceSelect({
  label,
  value,
  options,
  loading,
  disabled,
  onChange,
  onSearch,
}: {
  label: string;
  value: ArgusPlace | null;
  options: ArgusPlace[];
  loading: boolean;
  disabled?: boolean;
  onChange: (place: ArgusPlace | null) => void;
  /** Când există, textul tastat se trimite la server (localități). */
  onSearch?: (query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{value ? value.name : label}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={!onSearch}>
          <CommandInput
            placeholder={`Caută: ${label.toLowerCase()}`}
            aria-label={`Caută ${label.toLowerCase()}`}
            onValueChange={(v) => onSearch?.(v)}
          />
          <CommandList>
            <CommandEmpty>{loading ? "Se încarcă…" : "Nicio potrivire."}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={ALL}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 size-4", !value ? "opacity-100" : "opacity-0")} />
                Toate
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.name} ${o.id}`}
                  onSelect={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 size-4", value?.id === o.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{o.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Selector multiplu pentru zonele Argus (orașul ales). */
function AreasSelect({
  value,
  options,
  loading,
  disabled,
  onChange,
}: {
  value: ArgusPlace[];
  options: ArgusPlace[];
  loading: boolean;
  disabled?: boolean;
  onChange: (areas: ArgusPlace[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const toggle = (place: ArgusPlace) =>
    onChange(
      value.some((a) => a.id === place.id)
        ? value.filter((a) => a.id !== place.id)
        : [...value, place],
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label="Zonă"
          aria-haspopup="dialog"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{value.length ? `${value.length} zone` : "Zonă"}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="relative pb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Caută zona"
            aria-label="Caută zona"
            className="pl-9"
          />
        </div>
        <ScrollArea className="h-64">
          {loading ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Se încarcă…</p>
          ) : visible.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Nicio zonă nu corespunde.</p>
          ) : (
            visible.map((area) => (
              <label
                key={area.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={value.some((a) => a.id === area.id)}
                  onCheckedChange={() => toggle(area)}
                  aria-label={area.name}
                />
                <span className="truncate">{area.name}</span>
              </label>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Căutarea                                                             */
/* ------------------------------------------------------------------ */

function ArgusSearch() {
  const fetchCounties = useServerFn(getArgusLocations);
  const fetchPropertyTypes = useServerFn(getArgusPropertyTypes);
  const fetchSearch = useServerFn(searchArgusListings);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<Applied>({ page: 1, listedBy: "owner" });
  const [cityQuery, setCityQuery] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setCitySearch(cityQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [cityQuery]);

  const patch = (part: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...part }));

  const counties = useQuery({
    queryKey: ["argus-counties"],
    queryFn: () => fetchCounties({ data: { kind: "counties" } }),
    staleTime: ARGUS_CACHE_MS,
  });
  const cities = useQuery({
    queryKey: ["argus-cities", draft.county?.id, citySearch],
    queryFn: () =>
      fetchCounties({
        data: {
          kind: "cities",
          countyIds: draft.county ? [draft.county.id] : undefined,
          query: citySearch || undefined,
        },
      }),
    enabled: !!draft.county,
    staleTime: ARGUS_CACHE_MS,
  });
  const areas = useQuery({
    queryKey: ["argus-areas", draft.city?.id],
    queryFn: () =>
      fetchCounties({ data: { kind: "areas", cityIds: draft.city ? [draft.city.id] : undefined } }),
    enabled: !!draft.city,
    staleTime: ARGUS_CACHE_MS,
  });
  const propertyTypes = useQuery({
    queryKey: ["argus-property-types"],
    queryFn: () => fetchPropertyTypes(),
    staleTime: ARGUS_CACHE_MS,
  });

  // Aceeași căutare repetată în 5 minute se servește din cache (staleTime),
  // fără o nouă cerere la Argus.
  const results = useQuery({
    queryKey: ["argus-search", applied],
    queryFn: () => fetchSearch({ data: applied }),
    staleTime: ARGUS_CACHE_MS,
    placeholderData: keepPreviousData,
  });

  const total = results.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ARGUS_PAGE_SIZE));
  const toggleRoom = (r: number) =>
    patch({ rooms: draft.rooms.includes(r) ? draft.rooms.filter((x) => x !== r) : [...draft.rooms, r] });

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(toApplied(draft, 1));
        }}
      >
        <div className="grid grid-cols-1 gap-3 border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
          <Select
            value={draft.transaction || ALL}
            onValueChange={(v) => patch({ transaction: v === ALL ? "" : v })}
          >
            <SelectTrigger aria-label="Tranzacție">
              <SelectValue placeholder="Tranzacție" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tranzacție</SelectItem>
              <SelectItem value="sale">Vânzare</SelectItem>
              <SelectItem value="rent">Închiriere</SelectItem>
            </SelectContent>
          </Select>
          <PlaceSelect
            label="Județ"
            value={draft.county}
            options={counties.data?.options ?? []}
            loading={counties.isLoading}
            onChange={(place) => patch({ county: place, city: null, areas: [] })}
          />
          <Select
            value={draft.listedBy}
            onValueChange={(v) => patch({ listedBy: v as Draft["listedBy"] })}
          >
            <SelectTrigger aria-label="Anunțuri de la">
              <SelectValue placeholder="Anunțuri de la" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Proprietar</SelectItem>
              <SelectItem value="all">Toți</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input
              inputMode="numeric"
              value={draft.priceMin}
              onChange={(e) => patch({ priceMin: e.target.value })}
              placeholder="Preț de la"
              aria-label="Preț de la"
            />
            <Input
              inputMode="numeric"
              value={draft.priceMax}
              onChange={(e) => patch({ priceMax: e.target.value })}
              placeholder="Preț până la"
              aria-label="Preț până la"
            />
          </div>
          <Button type="submit">
            <Search className="size-4" /> Căutare
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
          <PlaceSelect
            label="Localitate"
            value={draft.city}
            options={cities.data?.options ?? []}
            loading={cities.isFetching}
            disabled={!draft.county}
            onChange={(place) => patch({ city: place, areas: [] })}
            onSearch={setCityQuery}
          />
          <AreasSelect
            value={draft.areas}
            options={areas.data?.options ?? []}
            loading={areas.isFetching}
            disabled={!draft.city}
            onChange={(next) => patch({ areas: next })}
          />
          <Select
            value={draft.propertyType || ALL}
            onValueChange={(v) => patch({ propertyType: v === ALL ? "" : v })}
          >
            <SelectTrigger aria-label="Tip proprietate">
              <SelectValue placeholder="Tip proprietate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toate tipurile</SelectItem>
              {(propertyTypes.data ?? []).map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1" role="group" aria-label="Camere">
            <span className="mr-1 text-sm text-muted-foreground">Camere</span>
            {ROOM_OPTIONS.map((r) => (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={draft.rooms.includes(r) ? "default" : "outline"}
                aria-pressed={draft.rooms.includes(r)}
                className="h-10 min-w-10"
                onClick={() => toggleRoom(r)}
              >
                {r === 5 ? "5+" : r}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              inputMode="numeric"
              value={draft.surfaceMin}
              onChange={(e) => patch({ surfaceMin: e.target.value })}
              placeholder="Suprafață de la (m²)"
              aria-label="Suprafață utilă de la"
            />
            <Input
              inputMode="numeric"
              value={draft.surfaceMax}
              onChange={(e) => patch({ surfaceMax: e.target.value })}
              placeholder="Suprafață până la (m²)"
              aria-label="Suprafață utilă până la"
            />
          </div>
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setApplied({ page: 1, listedBy: "owner" });
              }}
            >
              Șterge filtre <X className="size-4" />
            </Button>
          </div>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {results.isLoading ? "Se încarcă…" : `${total.toLocaleString("ro-RO")} rezultate`}
        </span>
        <span>Rezultate live de la Argus — nu se salvează în Habitoo</span>
      </div>

      {results.isError ? (
        <p className="text-destructive">
          {results.error instanceof Error
            ? results.error.message
            : "Anunțurile Argus nu pot fi încărcate acum. Reîncearcă."}
        </p>
      ) : results.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (results.data?.items.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <SearchX className="size-8 text-muted-foreground" />
          <p className="font-medium">Niciun anunț găsit</p>
          <p className="text-sm text-muted-foreground">Încearcă alte filtre.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {results.data?.items.map((item) => (
            <ArgusCard key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />
          ))}
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label="Paginare" className="flex flex-wrap items-center justify-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={applied.page === 1}
            onClick={() => setApplied((prev) => ({ ...prev, page: prev.page - 1 }))}
            aria-label="Pagina anterioară"
          >
            <ChevronLeft className="size-4" /> Înapoi
          </Button>
          <span className="px-2 text-sm text-muted-foreground">
            Pagina {applied.page} din {pages.toLocaleString("ro-RO")}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={applied.page >= pages}
            onClick={() => setApplied((prev) => ({ ...prev, page: prev.page + 1 }))}
            aria-label="Pagina următoare"
          >
            Înainte <ChevronRight className="size-4" />
          </Button>
        </nav>
      ) : null}

      <ArgusDetailDialog propertyId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cardul unui anunț                                                    */
/* ------------------------------------------------------------------ */

function ArgusCard({ item, onOpen }: { item: ArgusPropertyCard; onOpen: () => void }) {
  const fetchImages = useServerFn(getArgusListingImages);
  // Poza cardului se cere doar pentru anunțurile care au imagini.
  const image = useQuery({
    queryKey: ["argus-card-image", item.id],
    queryFn: () => fetchImages({ data: { propertyId: item.id } }),
    enabled: item.hasImage,
    staleTime: ARGUS_CACHE_MS,
  });
  const firstImage = image.data?.[0] ?? null;
  const place = [item.area, item.city, item.county].filter(Boolean).join(", ");
  const specs = [
    item.propertyTypeLabel,
    item.rooms !== null ? `${item.rooms} camere` : null,
    item.surface !== null ? `${item.surface} m²` : null,
    item.floor ? `Etaj ${item.floor}` : null,
  ].filter(Boolean);

  return (
    <article className="relative flex flex-col gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 sm:flex-row sm:gap-4">
      {firstImage ? (
        <img
          src={firstImage.thumb ?? firstImage.full}
          alt={item.title ?? "Fotografie anunț"}
          loading="lazy"
          className="aspect-[4/3] w-full shrink-0 rounded-md object-cover sm:w-44"
        />
      ) : item.hasImage ? (
        <Skeleton className="aspect-[4/3] w-full shrink-0 sm:w-44" />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Argus</Badge>
          {item.sourceName ? <Badge variant="outline">{item.sourceName}</Badge> : null}
          {item.transactionLabel ? (
            <span className="text-xs text-muted-foreground">{item.transactionLabel}</span>
          ) : null}
          {item.date ? (
            <span className="text-xs text-muted-foreground">
              Adăugat {new Date(item.date).toLocaleDateString("ro-RO")}
            </span>
          ) : null}
        </div>
        <h3 className="line-clamp-1 font-semibold leading-snug">
          <button type="button" className="after:absolute after:inset-0 text-left hover:underline" onClick={onOpen}>
            {item.title ?? "Anunț fără titlu"}
          </button>
        </h3>
        <p className="text-lg font-bold text-primary">{money(item.price)}</p>
        {specs.length ? <p className="text-sm">{specs.join(" · ")}</p> : null}
        {place ? (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <span className="line-clamp-1">{place}</span>
          </p>
        ) : null}
      </div>
      <div className="relative z-10 flex shrink-0 flex-col gap-2 sm:w-44 sm:justify-center">
        <Button type="button" variant="outline" onClick={onOpen}>
          Detalii
        </Button>
        {item.url ? (
          <Button asChild className="flex-1 sm:flex-none">
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              Anunțul original <ExternalLink className="size-4" />
            </a>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Detaliul unui anunț                                                  */
/* ------------------------------------------------------------------ */

const DETAIL_LABELS: Record<string, string> = {
  rooms: "Camere",
  living_area: "Suprafață utilă (m²)",
  built_area: "Suprafață construită (m²)",
  lot_size_sqm: "Suprafață teren (m²)",
  year_built: "An construcție",
  bathrooms: "Băi",
  balconies: "Balcoane",
  floors_number_text: "Etaj",
};

function ArgusDetailDialog({
  propertyId,
  onClose,
}: {
  propertyId: string | null;
  onClose: () => void;
}) {
  const fetchDetail = useServerFn(getArgusListingDetail);
  const fetchContact = useServerFn(getArgusListingContact);
  const [phoneRequested, setPhoneRequested] = useState(false);

  useEffect(() => setPhoneRequested(false), [propertyId]);

  const detail = useQuery({
    queryKey: ["argus-detail", propertyId],
    queryFn: () => fetchDetail({ data: { propertyId: propertyId! } }),
    enabled: !!propertyId,
    staleTime: ARGUS_CACHE_MS,
  });
  // Telefonul se cere de la Argus DOAR la apăsarea „Arată telefon”.
  const contact = useQuery({
    queryKey: ["argus-contact", propertyId],
    queryFn: () => fetchContact({ data: { propertyId: propertyId! } }),
    enabled: !!propertyId && phoneRequested,
    staleTime: ARGUS_CACHE_MS,
  });

  const item = detail.data ?? null;
  const position = item?.position ?? null;
  const bbox = position
    ? [position.lon - 0.01, position.lat - 0.01, position.lon + 0.01, position.lat + 0.01].join(",")
    : null;

  return (
    <Dialog open={!!propertyId} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" aria-label="Detalii anunț Argus">
        <DialogHeader>
          <DialogTitle className="pr-8">{item?.title ?? "Detalii anunț"}</DialogTitle>
        </DialogHeader>
        {detail.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-56" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24" />
          </div>
        ) : detail.isError || !item ? (
          <p className="text-destructive">Detaliile anunțului nu pot fi încărcate acum.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Argus</Badge>
              {item.sourceName ? <Badge variant="outline">{item.sourceName}</Badge> : null}
              {item.listedByLabel ? (
                <span className="text-xs text-muted-foreground">{item.listedByLabel}</span>
              ) : null}
              {item.date ? (
                <span className="text-xs text-muted-foreground">
                  Adăugat {new Date(item.date).toLocaleDateString("ro-RO")}
                </span>
              ) : null}
            </div>
            <p className="text-xl font-bold text-primary">{money(item.price)}</p>
            {item.images.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {item.images.map((img, i) => (
                  <a key={img.full} href={img.full} target="_blank" rel="noopener noreferrer">
                    <img
                      src={img.thumb ?? img.full}
                      alt={`Fotografie ${i + 1}`}
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-md object-cover"
                    />
                  </a>
                ))}
              </div>
            ) : null}
            {Object.keys(item.details).length ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {Object.entries(item.details).map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <dt className="text-muted-foreground">{DETAIL_LABELS[key] ?? key}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {item.description ? (
              <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
                {item.description}
              </p>
            ) : null}
            {position && bbox ? (
              <iframe
                title="Harta proprietății"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${position.lat},${position.lon}`}
                className="h-64 w-full rounded-md border border-border"
                loading="lazy"
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              {!phoneRequested ? (
                <Button type="button" variant="outline" onClick={() => setPhoneRequested(true)}>
                  <Phone className="size-4" /> Arată telefon
                </Button>
              ) : contact.isLoading ? (
                <Button type="button" variant="outline" disabled>
                  Se încarcă…
                </Button>
              ) : contact.isError ? (
                <p className="text-sm text-destructive">Telefonul nu poate fi încărcat acum.</p>
              ) : (contact.data?.phones.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Anunțul nu are un telefon disponibil.</p>
              ) : (
                contact.data!.phones.map((phone) => (
                  <Button key={phone} asChild variant="outline">
                    <a href={`tel:${phone.replace(/\s+/g, "")}`}>
                      <Phone className="size-4" /> {phone}
                    </a>
                  </Button>
                ))
              )}
              {item.url ? (
                <Button asChild>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    Anunțul original <ExternalLink className="size-4" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
