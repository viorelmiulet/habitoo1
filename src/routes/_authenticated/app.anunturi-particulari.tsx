import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ExternalLink, MapPin, Phone, Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
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
import { PRIVATE_LISTINGS_PAGE_SIZE } from "@/lib/private-listings";

const searchSchema = z.object({
  oras: z.string().optional(),
  zona: z.string().optional(),
  camere: z.string().optional(),
  q: z.string().optional(),
  pagina: z.coerce.number().int().min(1).optional(),
});

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
    queryKey: ["owner-listings", search.oras, search.zona, rooms.join(","), search.q, page],
    queryFn: () =>
      fetchListings({
        data: { city: search.oras, zone: search.zona, rooms, q: search.q, page },
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
  const hasFilters = Boolean(search.oras || search.zona || rooms.length || search.q);

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
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{listings.isLoading ? "Se încarcă…" : `${total} anunțuri`}</span>
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
      </div>

      {listings.isError ? (
        <p className="text-destructive">Anunțurile nu pot fi încărcate acum. Reîncearcă.</p>
      ) : listings.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {listings.data?.items.map((l) => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => navigate({ search: (p) => ({ ...p, pagina: page > 1 ? page : undefined }) })}
          >
            Înapoi
          </Button>
          <span className="text-sm text-muted-foreground">
            Pagina {page + 1} din {pages}
          </span>
          <Button
            variant="outline"
            disabled={page + 1 >= pages}
            onClick={() => navigate({ search: (p) => ({ ...p, pagina: page + 2 }) })}
          >
            Înainte
          </Button>
        </div>
      ) : null}
    </div>
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
  return (
    <Card className="flex h-full flex-col gap-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <Badge variant="secondary" className="capitalize">
          {listing.source}
        </Badge>
        {listing.transactionType ? (
          <span className="text-xs text-muted-foreground">
            {/rent|inch/i.test(listing.transactionType) ? "Închiriere" : "Vânzare"}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <h3 className="line-clamp-2 font-semibold leading-snug">
          {listing.title?.trim() || "Anunț fără titlu"}
        </h3>
        <p className="text-xl font-bold text-primary">{money(listing.price, listing.currency)}</p>
        {specs.length ? <p className="text-sm">{specs.join(" · ")}</p> : null}
        {place ? (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <span className="line-clamp-1">{place}</span>
          </p>
        ) : null}
        {listing.description ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">{listing.description}</p>
        ) : null}
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
