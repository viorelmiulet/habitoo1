import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, MapPin, Phone, Search, SearchX, X } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { SearchableSelect } from "@/components/app/SearchableSelect";
import { ZonePickerDialog } from "@/components/app/ZonePickerDialog";
import { ImportListingButton } from "@/components/app/ImportListingButton";
import { ArgusTab } from "@/components/app/argus/ArgusTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOwnerListingFacets,
  getOwnerListings,
  type OwnerListing,
} from "@/lib/listings.functions";
import { PRIVATE_LISTINGS_PAGE_SIZE, type PrivateListingsSort } from "@/lib/private-listings";
import { geographyKey, localityScope } from "@/lib/private-listing-geography";

const searchSchema = z.object({
  // „argus” = tabul cu rezultate live de la Argus; lipsa = lista Habitoo.
  lista: z.enum(["argus"]).optional(),
  tab: z.enum(["apartamente", "case", "comerciale", "terenuri"]).optional(),
  judet: z.string().optional(),
  oras: z.string().optional(),
  // Mai multe zone odată; linkurile vechi cu o singură zonă (string) rămân valide.
  zona: z.union([z.string(), z.array(z.string())]).optional(),
  camere: z.string().optional(),
  q: z.string().optional(),
  pagina: z.coerce.number().int().min(1).optional(),
  sortare: z.enum(["newest", "price_asc", "price_desc", "surface_desc"]).optional(),
  sursa: z.enum(["storia", "imobiliare", "olx", "romimo", "imoradar", "anuntul"]).optional(),
  tranzactie: z.enum(["sale", "rent", "rent_day"]).optional(),
  tip: z.string().max(80).optional(), // linkuri vechi, înlocuit de tab
  zile: z.coerce.number().int().min(0).max(7).optional(),
  id: z.string().optional(),
  pretMin: z.coerce.number().min(0).optional(),
  pretMax: z.coerce.number().min(0).optional(),
  mpMin: z.coerce.number().min(0).optional(),
  mpMax: z.coerce.number().min(0).optional(),
  etajMin: z.coerce.number().int().optional(),
  etajMax: z.coerce.number().int().optional(),
  anMin: z.coerce.number().int().optional(),
  anMax: z.coerce.number().int().optional(),
  anNespecificat: z.coerce.boolean().optional(),
});

type Search = z.infer<typeof searchSchema>;

const SOURCE_LABELS: Record<string, string> = {
  storia: "Storia",
  imobiliare: "Imobiliare.ro",
  olx: "OLX",
  romimo: "Romimo",
  imoradar: "Imoradar24",
  anuntul: "Anuntul.ro",
};

const SORT_LABELS: Record<PrivateListingsSort, string> = {
  newest: "Cele mai noi",
  price_asc: "Preț crescător",
  price_desc: "Preț descrescător",
  surface_desc: "Suprafață descrescătoare",
};

const TAB_LABELS: Record<string, string> = {
  apartamente: "Apartamente",
  case: "Case/Vile",
  comerciale: "Comerciale",
  terenuri: "Terenuri",
  toate: "Toate",
};

const DAYS_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "De azi" },
  { value: "2", label: "Ultimele 2 zile" },
  { value: "3", label: "Ultimele 3 zile" },
  { value: "7", label: "Ultimele 7 zile" },
];

export const Route = createFileRoute("/_authenticated/app/anunturi-particulari")({
  validateSearch: searchSchema,
  head: () => { const title = "Anunțuri particulari — Habitoo CRM"; const description = "Anunțuri particulari, fotografii și import cu acordul proprietarului în portofoliul agenției."; const head = appHead(title); return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  component: PrivateListingsPage,
});

const ROOM_OPTIONS = [1, 2, 3, 4, 5];
const ALL = "__all";

function money(value: number | null, currency: string | null) {
  if (value === null) return "Preț nespecificat";
  try {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} ${currency ?? ""}`;
  }
}

/** Ciorna filtrelor: se aplică abia la „Căutare” sau Enter, nu la fiecare modificare. */
type Draft = {
  tranzactie: string;
  judet: string;
  oras: string;
  zona: string[];
  zile: string;
  pretMin: string;
  pretMax: string;
  sursa: string;
  id: string;
  camere: number[];
  mpMin: string;
  mpMax: string;
  etajMin: string;
  etajMax: string;
  anMin: string;
  anMax: string;
  anNespecificat: boolean;
  q: string;
};

const numText = (v: number | undefined) => (v === undefined ? "" : String(v));

/** URL-ul acceptă o zonă (linkuri vechi) sau mai multe; în interior lucrăm mereu cu listă. */
const zonaList = (zona: Search["zona"]): string[] =>
  (Array.isArray(zona) ? zona : zona ? [zona] : []).map(geographyKey).filter(Boolean);

function draftFromSearch(search: Search): Draft {
  return {
    tranzactie: search.tranzactie ?? "",
    judet: search.judet ?? "",
    oras: search.oras ?? "",
    zona: zonaList(search.zona),
    zile: search.zile === undefined ? "" : String(search.zile),
    pretMin: numText(search.pretMin),
    pretMax: numText(search.pretMax),
    sursa: search.sursa ?? "",
    id: search.id ?? "",
    camere: (search.camere ?? "")
      .split(",")
      .map(Number)
      .filter((n) => ROOM_OPTIONS.includes(n)),
    mpMin: numText(search.mpMin),
    mpMax: numText(search.mpMax),
    etajMin: numText(search.etajMin),
    etajMax: numText(search.etajMax),
    anMin: numText(search.anMin),
    anMax: numText(search.anMax),
    anNespecificat: search.anNespecificat !== false,
    q: search.q ?? "",
  };
}

const parseNum = (text: string): number | undefined => {
  const n = Number(text.replace(/[^\d-]/g, ""));
  return text.trim() && Number.isFinite(n) ? n : undefined;
};

function PrivateListingsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const fetchListings = useServerFn(getOwnerListings);
  const fetchFacets = useServerFn(getOwnerListingFacets);
  const rooms = (search.camere ?? "")
    .split(",")
    .map(Number)
    .filter((n) => ROOM_OPTIONS.includes(n));
  const selectedZones = zonaList(search.zona);
  const page = (search.pagina ?? 1) - 1;

  const [draft, setDraft] = useState<Draft>(() => draftFromSearch(search));
  const [extendedOpen, setExtendedOpen] = useState(false);
  const searchKey = JSON.stringify(search);
  useEffect(() => setDraft(draftFromSearch(JSON.parse(searchKey) as Search)), [searchKey]);

  const patch = (part: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...part }));

  const apply = (next: Draft) =>
    navigate({
      search: (prev) => ({
        tab: prev.tab,
        sortare: prev.sortare,
        tranzactie: (next.tranzactie || undefined) as Search["tranzactie"],
        judet: next.judet || undefined,
        oras: next.judet ? next.oras || undefined : undefined,
        zona: next.judet && next.oras && next.zona.length ? next.zona : undefined,
        zile: next.zile === "" ? undefined : Number(next.zile),
        pretMin: parseNum(next.pretMin),
        pretMax: parseNum(next.pretMax),
        sursa: (next.sursa || undefined) as Search["sursa"],
        id: next.id.trim() || undefined,
        camere: next.camere.length ? [...next.camere].sort().join(",") : undefined,
        mpMin: parseNum(next.mpMin),
        mpMax: parseNum(next.mpMax),
        etajMin: parseNum(next.etajMin),
        etajMax: parseNum(next.etajMax),
        anMin: parseNum(next.anMin),
        anMax: parseNum(next.anMax),
        anNespecificat: next.anNespecificat ? undefined : false,
        q: next.q.trim() || undefined,
      }),
      replace: true,
    });

  const resetFilters = () =>
    navigate({ search: { tab: search.tab, sortare: search.sortare }, replace: true });

  // În tabul „Argus” lista Habitoo nu se încarcă deloc.
  const habitooTab = search.lista !== "argus";
  const facets = useQuery({
    queryKey: ["owner-listing-facets"],
    queryFn: () => fetchFacets(),
    staleTime: 5 * 60_000,
    enabled: habitooTab,
  });
  const listings = useQuery({
    queryKey: [
      "owner-listings", search.tab, search.judet, search.oras, selectedZones.join(","), rooms.join(","), search.q, page,
      search.sursa, search.tranzactie, search.tip, search.pretMin, search.pretMax, search.mpMin, search.mpMax,
      search.sortare, search.zile, search.id, search.etajMin, search.etajMax, search.anMin, search.anMax,
      search.anNespecificat,
    ],
    queryFn: () =>
      fetchListings({
        data: {
          category: search.tab,
          county: search.judet, city: search.oras, zone: selectedZones.length ? selectedZones : undefined, rooms, q: search.q, page,
          source: search.sursa, transaction: search.tranzactie,
          propertyType: search.tab ? undefined : search.tip,
          priceMin: search.pretMin, priceMax: search.pretMax,
          surfaceMin: search.mpMin, surfaceMax: search.mpMax,
          days: search.zile, externalId: search.id,
          floorMin: search.etajMin, floorMax: search.etajMax,
          yearMin: search.anMin, yearMax: search.anMax,
          yearUnknown: search.anNespecificat,
          sort: search.sortare,
        },
      }),
    placeholderData: keepPreviousData,
    enabled: habitooTab,
  });

  const draftCountyKey = geographyKey(draft.judet);
  const draftCityKey = geographyKey(draft.oras);
  const localities = facets.data?.localities[draftCountyKey] ?? [];
  const zones = draft.oras ? (facets.data?.zones[localityScope(draft.judet, draft.oras)] ?? []) : [];
  const total = listings.data?.total ?? 0;
  const newToday = listings.data?.newToday ?? 0;
  const pages = Math.max(1, Math.ceil(total / PRIVATE_LISTINGS_PAGE_SIZE));
  const toggleDraftRoom = (r: number) =>
    patch({ camere: draft.camere.includes(r) ? draft.camere.filter((x) => x !== r) : [...draft.camere, r] });

  const extendedCount = [
    search.oras, selectedZones.length ? "x" : "", search.sursa, search.id, search.camere, search.q,
    search.mpMin, search.mpMax, search.etajMin, search.etajMax, search.anMin, search.anMax,
  ].filter((v) => v !== undefined && v !== "").length;
  const hasFilters = Boolean(
    search.judet || search.oras || selectedZones.length || rooms.length || search.q || search.sursa || search.tranzactie ||
      search.tip || search.id || search.zile !== undefined ||
      search.pretMin !== undefined || search.pretMax !== undefined ||
      search.mpMin !== undefined || search.mpMax !== undefined ||
      search.etajMin !== undefined || search.etajMax !== undefined ||
      search.anMin !== undefined || search.anMax !== undefined,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Anunțuri particulari"
        description="Anunțuri de la proprietari, aduse automat din alte site-uri. Verifică datele înainte să contactezi proprietarul."
      />

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        <div className="flex gap-5 overflow-x-auto border-b border-border" role="tablist" aria-label="Categorie proprietate">
          {Object.entries(TAB_LABELS).map(([value, label]) => {
            const active = (search.tab ?? "toate") === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                className={`-mb-px shrink-0 border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      pagina: undefined,
                      tip: undefined,
                      tab: value === "toate" ? undefined : (value as Search["tab"]),
                    }),
                    replace: true,
                  })
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.4fr_auto_auto]">
          <Select value={draft.tranzactie || ALL} onValueChange={(v) => patch({ tranzactie: v === ALL ? "" : v })}>
            <SelectTrigger aria-label="Tranzacție"><SelectValue placeholder="Tranzacție" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tranzacție</SelectItem>
              <SelectItem value="sale">Vânzare</SelectItem>
              <SelectItem value="rent">Închiriere</SelectItem>
              <SelectItem value="rent_day">Închiriere pe zi</SelectItem>
            </SelectContent>
          </Select>
          <SearchableSelect
            ariaLabel="Județ"
            placeholder="Județ"
            allLabel="Toate județele"
            value={draftCountyKey}
            options={facets.data?.counties ?? []}
            onChange={(v) => patch({ judet: v, oras: "", zona: [] })}
          />
          <Select value={draft.zile || ALL} onValueChange={(v) => patch({ zile: v === ALL ? "" : v })}>
            <SelectTrigger aria-label="Zile în piață"><SelectValue placeholder="Zile în piață" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Indiferent</SelectItem>
              {DAYS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input inputMode="numeric" value={draft.pretMin} onChange={(e) => patch({ pretMin: e.target.value })} placeholder="Preț de la" aria-label="Preț de la" />
            <Input inputMode="numeric" value={draft.pretMax} onChange={(e) => patch({ pretMax: e.target.value })} placeholder="Preț până la" aria-label="Preț până la" />
          </div>
          <Button
            type="button"
            variant="outline"
            aria-expanded={extendedOpen}
            onClick={() => setExtendedOpen((v) => !v)}
          >
            {extendedOpen ? "Mai puține" : "Mai multe"}
            {extendedOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {!extendedOpen && extendedCount > 0 ? (
              <span className="text-xs text-muted-foreground">+{extendedCount} filtre</span>
            ) : null}
          </Button>
          <Button type="submit">
            <Search className="size-4" /> Căutare
          </Button>
        </div>

        {extendedOpen ? (
          <div className="space-y-3 border border-border bg-card p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SearchableSelect
                ariaLabel="Localitate"
                placeholder="Localitate"
                allLabel="Toate localitățile"
                value={draftCityKey}
                disabled={!draft.judet && !draft.oras}
                options={localities}
                onChange={(v) => patch({ oras: v, zona: [] })}
              />
              <ZonePickerDialog
                zones={zones}
                isBucharest={draftCityKey === "bucuresti"}
                selected={draft.zona}
                disabled={!draft.oras || zones.length === 0}
                onApply={(next) => patch({ zona: next })}
              />
              <Select value={draft.sursa || ALL} onValueChange={(v) => patch({ sursa: v === ALL ? "" : v })}>
                <SelectTrigger aria-label="Sursă"><SelectValue placeholder="Sursă" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Toate sursele</SelectItem>
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={draft.id} onChange={(e) => patch({ id: e.target.value })} placeholder="ID anunț" aria-label="ID anunț" />
              <div className="flex items-center gap-1" role="group" aria-label="Camere">
                <span className="mr-1 text-sm text-muted-foreground">Camere</span>
                {ROOM_OPTIONS.map((r) => (
                  <Button
                    key={r}
                    type="button"
                    size="sm"
                    variant={draft.camere.includes(r) ? "default" : "outline"}
                    aria-pressed={draft.camere.includes(r)}
                    className="h-10 min-w-10"
                    onClick={() => toggleDraftRoom(r)}
                  >
                    {r === 5 ? "5+" : r}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input inputMode="numeric" value={draft.mpMin} onChange={(e) => patch({ mpMin: e.target.value })} placeholder="Suprafață de la (m²)" aria-label="Suprafață utilă de la" />
                <Input inputMode="numeric" value={draft.mpMax} onChange={(e) => patch({ mpMax: e.target.value })} placeholder="Suprafață până la (m²)" aria-label="Suprafață utilă până la" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input inputMode="numeric" value={draft.etajMin} onChange={(e) => patch({ etajMin: e.target.value })} placeholder="Etaj de la (Parter = 0)" aria-label="Etaj de la" />
                <Input inputMode="numeric" value={draft.etajMax} onChange={(e) => patch({ etajMax: e.target.value })} placeholder="Etaj până la" aria-label="Etaj până la" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input inputMode="numeric" value={draft.anMin} onChange={(e) => patch({ anMin: e.target.value })} placeholder="An construcție de la" aria-label="An construcție de la" />
                <Input inputMode="numeric" value={draft.anMax} onChange={(e) => patch({ anMax: e.target.value })} placeholder="An construcție până la" aria-label="An construcție până la" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.anNespecificat}
                  onCheckedChange={(checked) => patch({ anNespecificat: checked === true })}
                  aria-label="Include an construcție nespecificat"
                />
                Include an construcție nespecificat
              </label>
              <div className="relative sm:col-span-2 lg:col-span-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={draft.q}
                  onChange={(e) => patch({ q: e.target.value })}
                  placeholder="Cuvinte cheie: centrală, parcare, renovat…"
                  className="pl-9"
                  aria-label="Cuvinte cheie"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={resetFilters}>
                Șterge filtre <X className="size-4" />
              </Button>
              <Button type="button" variant="outline" onClick={() => setExtendedOpen(false)}>
                Închide filtre <ChevronUp className="size-4" />
              </Button>
              <Button type="submit">
                <Search className="size-4" /> Căutare
              </Button>
            </div>
          </div>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">
            {listings.isLoading ? "Se încarcă…" : `${total} rezultate`}
          </span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            disabled={newToday === 0 || search.zile === 0}
            onClick={() =>
              navigate({ search: (prev) => ({ ...prev, pagina: undefined, zile: 0 }), replace: true })
            }
          >
            {newToday} anunțuri noi
          </button>
        </div>
        <Select
          value={search.sortare ?? "newest"}
          onValueChange={(v) =>
            navigate({
              search: (prev) => ({ ...prev, pagina: undefined, sortare: v === "newest" ? undefined : (v as PrivateListingsSort) }),
              replace: true,
            })
          }
        >
          <SelectTrigger aria-label="Sortare" className="w-56">
            <SelectValue placeholder="Sortare" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {listings.isError ? (
        <p className="text-destructive">Anunțurile nu pot fi încărcate acum. Reîncearcă.</p>
      ) : listings.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <SearchX className="size-8 text-muted-foreground" />
          <p className="font-medium">Niciun anunț găsit</p>
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "Încearcă alte filtre." : "Anunțurile apar aici după primul import."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {listings.data?.items.map((l) => <ListingRow key={l.id} listing={l} />)}
        </div>
      )}

      {pages > 1 ? (
        <Pagination
          page={page + 1}
          pages={pages}
          onGo={(p) =>
            navigate({ search: (prev) => ({ ...prev, pagina: p > 1 ? p : undefined }) })
          }
        />
      ) : null}
    </div>
  );
}

/** Paginare numerotată: prima, ultima și două pagini în jurul celei curente. */
function pageNumbers(current: number, pages: number): (number | "…")[] {
  const wanted = new Set([1, pages, current - 1, current, current + 1]);
  const list = [...wanted].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of list) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

function Pagination({ page, pages, onGo }: { page: number; pages: number; onGo: (p: number) => void }) {
  return (
    <nav aria-label="Paginare" className="flex flex-wrap items-center justify-center gap-1">
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onGo(page - 1)} aria-label="Pagina anterioară">
        <ChevronLeft className="size-4" /> Înapoi
      </Button>
      {pageNumbers(page, pages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="sm"
            className="min-w-9"
            aria-current={p === page ? "page" : undefined}
            onClick={() => onGo(p)}
          >
            {p}
          </Button>
        ),
      )}
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onGo(page + 1)} aria-label="Pagina următoare">
        Înainte <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}

function ListingRow({ listing }: { listing: OwnerListing }) {
  const place = [listing.zone, listing.city ?? listing.location, listing.county]
    .filter(Boolean)
    .join(", ");
  const specs = [
    listing.propertyType?.trim() || null,
    listing.rooms !== null ? `${listing.rooms} camere` : null,
    listing.surface !== null ? `${listing.surface} m²` : null,
    listing.floor ? `Etaj ${listing.floor}` : null,
  ].filter(Boolean);
  const firstImage = listing.images[0] ?? null;
  const transaction = listing.transactionType
    ? /pe zi/i.test(listing.transactionType)
      ? "Închiriere pe zi"
      : /rent|inch/i.test(listing.transactionType)
        ? "Închiriere"
        : "Vânzare"
    : null;
  return (
    <article className="relative flex flex-col gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 sm:flex-row sm:gap-4">
      {firstImage ? (
        <img
          src={firstImage}
          alt={listing.title?.trim() || "Fotografie anunț"}
          loading="lazy"
          className="aspect-[4/3] w-full shrink-0 rounded-md object-cover sm:w-44"
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{SOURCE_LABELS[listing.source] ?? listing.source}</Badge>
          {transaction ? <span className="text-xs text-muted-foreground">{transaction}</span> : null}
          {listing.firstSeenAt ? (
            <span className="text-xs text-muted-foreground">
              Adăugat {new Date(listing.firstSeenAt).toLocaleDateString("ro-RO")}
            </span>
          ) : null}
        </div>
        <h3 className="line-clamp-1 font-semibold leading-snug">
          <Link
            to="/app/anunturi-particulari/$id"
            params={{ id: listing.id }}
            className="after:absolute after:inset-0 hover:underline"
          >
            {listing.title?.trim() || "Anunț fără titlu"}
          </Link>
        </h3>
        {listing.price === null ? (
          <p className="text-sm font-medium text-muted-foreground">
            Preț nedisponibil
            {listing.url ? (
              <>
                {" – "}
                <a href={listing.url} target="_blank" rel="noopener noreferrer" className="relative z-10 text-primary underline">
                  vezi anunțul pe {SOURCE_LABELS[listing.source] ?? listing.source}
                </a>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-lg font-bold text-primary">{money(listing.price, listing.currency)}</p>
        )}
        {specs.length ? <p className="text-sm">{specs.join(" · ")}</p> : null}
        {place ? (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <span className="line-clamp-1">{place}</span>
          </p>
        ) : null}
        {listing.description ? <ListingDescription text={listing.description} /> : null}
      </div>
      <div className="relative z-10 flex shrink-0 flex-col gap-2 sm:w-44 sm:justify-center">
        <ImportListingButton listingId={listing.id} />
        {listing.phone ? (
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <a href={`tel:${listing.phone}`}>
              <Phone className="size-4" /> {listing.phone}
            </a>
          </Button>
        ) : null}
        {listing.url ? (
          <Button asChild className="flex-1 sm:flex-none">
            <a href={listing.url} target="_blank" rel="noopener noreferrer">
              Anunțul original <ExternalLink className="size-4" />
            </a>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

const DESCRIPTION_COLLAPSED_LENGTH = 280;

function ListingDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > DESCRIPTION_COLLAPSED_LENGTH;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={`text-sm whitespace-pre-line break-words text-muted-foreground ${
          expanded || !long ? "" : "line-clamp-2"
        }`}
      >
        {text}
      </p>
      {long ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Arată mai puțin" : "Arată tot"}
        </Button>
      ) : null}
    </div>
  );
}
