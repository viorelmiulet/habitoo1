import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, Phone, Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const searchSchema = z.object({
  oras: z.string().optional(),
  zona: z.string().optional(),
  camere: z.string().optional(),
  q: z.string().optional(),
  pagina: z.coerce.number().int().min(1).optional(),
  sortare: z.enum(["newest", "price_asc", "price_desc", "surface_desc"]).optional(),
  sursa: z.enum(["storia", "imobiliare", "olx", "romimo"]).optional(),
  tranzactie: z.enum(["sale", "rent", "rent_day"]).optional(),
  tip: z.string().max(80).optional(),
  pretMin: z.coerce.number().min(0).optional(),
  pretMax: z.coerce.number().min(0).optional(),
  mpMin: z.coerce.number().min(0).optional(),
  mpMax: z.coerce.number().min(0).optional(),
});

const SOURCE_LABELS: Record<string, string> = {
  storia: "Storia",
  imobiliare: "Imobiliare.ro",
  olx: "OLX",
  romimo: "Romimo",
};

const SORT_LABELS: Record<PrivateListingsSort, string> = {
  newest: "Cele mai noi",
  price_asc: "Preț crescător",
  price_desc: "Preț descrescător",
  surface_desc: "Suprafață descrescătoare",
};

export const Route = createFileRoute("/_authenticated/app/anunturi-particulari")({
  validateSearch: searchSchema,
  head: () => appHead("Anunțuri particulari — Habitoo CRM"),
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

function PrivateListingsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const fetchListings = useServerFn(getOwnerListings);
  const fetchFacets = useServerFn(getOwnerListingFacets);
  const rooms = (search.camere ?? "")
    .split(",")
    .map(Number)
    .filter((n) => ROOM_OPTIONS.includes(n));
  const page = (search.pagina ?? 1) - 1;
  const [keywords, setKeywords] = useState(search.q ?? "");

  useEffect(() => setKeywords(search.q ?? ""), [search.q]);

  const update = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev) => ({ ...prev, pagina: undefined, ...patch }), replace: true });

  useEffect(() => {
    const id = setTimeout(() => {
      if ((search.q ?? "") !== keywords.trim()) update({ q: keywords.trim() || undefined });
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywords]);

  const facets = useQuery({
    queryKey: ["owner-listing-facets"],
    queryFn: () => fetchFacets(),
    staleTime: 5 * 60_000,
  });
  const listings = useQuery({
    queryKey: [
      "owner-listings", search.oras, search.zona, rooms.join(","), search.q, page,
      search.sursa, search.tranzactie, search.tip, search.pretMin, search.pretMax, search.mpMin, search.mpMax,
      search.sortare,
    ],
    queryFn: () =>
      fetchListings({
        data: {
          city: search.oras, zone: search.zona, rooms, q: search.q, page,
          source: search.sursa, transaction: search.tranzactie, propertyType: search.tip,
          priceMin: search.pretMin, priceMax: search.pretMax,
          surfaceMin: search.mpMin, surfaceMax: search.mpMax,
          sort: search.sortare,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const zones = search.oras ? (facets.data?.zones[search.oras] ?? []) : [];
  const total = listings.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PRIVATE_LISTINGS_PAGE_SIZE));
  const toggleRoom = (r: number) => {
    const next = rooms.includes(r) ? rooms.filter((x) => x !== r) : [...rooms, r].sort();
    update({ camere: next.length ? next.join(",") : undefined });
  };
  const hasFilters = Boolean(
    search.oras || search.zona || rooms.length || search.q || search.sursa || search.tranzactie || search.tip ||
      search.pretMin !== undefined || search.pretMax !== undefined ||
      search.mpMin !== undefined || search.mpMax !== undefined,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Anunțuri particulari"
        description="Anunțuri de la proprietari, aduse automat din alte site-uri. Verifică datele înainte să contactezi proprietarul."
      />

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto] lg:grid-cols-[1fr_1fr_auto_1.5fr]">
        <Select
          value={search.oras ?? ALL}
          onValueChange={(v) => update({ oras: v === ALL ? undefined : v, zona: undefined })}
        >
          <SelectTrigger aria-label="Oraș">
            <SelectValue placeholder="Oraș" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toate orașele</SelectItem>
            {(facets.data?.cities ?? []).map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.zona ?? ALL}
          disabled={!search.oras || zones.length === 0}
          onValueChange={(v) => update({ zona: v === ALL ? undefined : v })}
        >
          <SelectTrigger aria-label="Zonă">
            <SelectValue placeholder={search.oras ? "Zonă" : "Alege întâi orașul"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toate zonele</SelectItem>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1" role="group" aria-label="Camere">
          {ROOM_OPTIONS.map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={rooms.includes(r) ? "default" : "outline"}
              aria-pressed={rooms.includes(r)}
              className="h-10 min-w-10"
              onClick={() => toggleRoom(r)}
            >
              {r === 5 ? "5+" : r}
            </Button>
          ))}
        </div>
        <div className="relative md:col-span-3 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Cuvinte cheie: centrală, parcare, renovat…"
            className="pl-9"
            aria-label="Cuvinte cheie"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 md:col-span-3 lg:col-span-4 lg:grid-cols-7">
          <Select
            value={search.sursa ?? ALL}
            onValueChange={(v) => update({ sursa: v === ALL ? undefined : (v as "storia") })}
          >
            <SelectTrigger aria-label="Sursă"><SelectValue placeholder="Sursă" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toate sursele</SelectItem>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={search.tranzactie ?? ALL}
            onValueChange={(v) => update({ tranzactie: v === ALL ? undefined : (v as "sale") })}
          >
            <SelectTrigger aria-label="Tip anunț"><SelectValue placeholder="Tip anunț" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Vânzare și închiriere</SelectItem>
              <SelectItem value="sale">Vânzare</SelectItem>
              <SelectItem value="rent">Închiriere</SelectItem>
              <SelectItem value="rent_day">Închiriere pe zi</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={search.tip ?? ALL}
            onValueChange={(v) => update({ tip: v === ALL ? undefined : v })}
          >
            <SelectTrigger aria-label="Tip proprietate"><SelectValue placeholder="Tip proprietate" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toate tipurile</SelectItem>
              {(facets.data?.propertyTypes ?? []).map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NumberFilter label="Preț minim (€)" value={search.pretMin} onChange={(v) => update({ pretMin: v })} />
          <NumberFilter label="Preț maxim (€)" value={search.pretMax} onChange={(v) => update({ pretMax: v })} />
          <NumberFilter label="Suprafață min. (m²)" value={search.mpMin} onChange={(v) => update({ mpMin: v })} />
          <NumberFilter label="Suprafață max. (m²)" value={search.mpMax} onChange={(v) => update({ mpMax: v })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{listings.isLoading ? "Se încarcă…" : `${total} anunțuri`}</span>
        <div className="flex items-center gap-2">
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setKeywords("");
                navigate({ search: {}, replace: true });
              }}
            >
              Șterge filtrele
            </Button>
          ) : null}
          <Select
            value={search.sortare ?? "newest"}
            onValueChange={(v) => update({ sortare: v === "newest" ? undefined : (v as PrivateListingsSort) })}
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

function ListingCard({ listing }: { listing: OwnerListing }) {
  const place = [listing.zone, listing.city ?? listing.location, listing.county]
    .filter(Boolean)
    .join(", ");
  const specs = [
    listing.rooms !== null ? `${listing.rooms} camere` : null,
    listing.surface !== null ? `${listing.surface} m²` : null,
    listing.floor ? `Etaj ${listing.floor}` : null,
  ].filter(Boolean);
  const firstImage = listing.images[0] ?? null;
  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden">
      {firstImage ? (
        <img
          src={firstImage}
          alt={listing.title?.trim() || "Fotografie anunț"}
          loading="lazy"
          className="aspect-[16/9] w-full object-cover"
        />
      ) : null}
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <Badge variant="secondary">
          Sursă: {SOURCE_LABELS[listing.source] ?? listing.source}
        </Badge>
        {listing.transactionType ? (
          <span className="text-xs text-muted-foreground">
            {/pe zi/i.test(listing.transactionType)
              ? "Închiriere pe zi"
              : /rent|inch/i.test(listing.transactionType)
                ? "Închiriere"
                : "Vânzare"}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <h3 className="line-clamp-2 font-semibold leading-snug">
          {listing.title?.trim() || "Anunț fără titlu"}
        </h3>
        {listing.price === null ? (
          <p className="text-sm font-medium text-muted-foreground">
            Preț nedisponibil
            {listing.url ? (
              <>
                {" – "}
                <a href={listing.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  vezi anunțul pe {SOURCE_LABELS[listing.source] ?? listing.source}
                </a>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-xl font-bold text-primary">{money(listing.price, listing.currency)}</p>
        )}
        {specs.length ? <p className="text-sm">{specs.join(" · ")}</p> : null}
        {place ? (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <span className="line-clamp-1">{place}</span>
          </p>
        ) : null}
        {listing.description ? <ListingDescription text={listing.description} /> : null}
      </CardContent>
      <CardFooter className="flex gap-2 pt-3">
        {listing.phone ? (
          <Button asChild variant="outline" className="flex-1">
            <a href={`tel:${listing.phone}`}>
              <Phone className="size-4" /> {listing.phone}
            </a>
          </Button>
        ) : null}
        {listing.url ? (
          <Button asChild className="flex-1">
            <a href={listing.url} target="_blank" rel="noopener noreferrer">
              Anunțul original <ExternalLink className="size-4" />
            </a>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
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
          expanded || !long ? "" : "line-clamp-6"
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

function NumberFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  useEffect(() => setText(value?.toString() ?? ""), [value]);
  const commit = () => {
    const n = Number(text.replace(/[^\d]/g, ""));
    const next = text.trim() && Number.isFinite(n) ? n : undefined;
    if (next !== value) onChange(next);
  };
  return (
    <Input
      inputMode="numeric"
      value={text}
      placeholder={label}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}
