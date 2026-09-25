import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ExternalLink, MapPin, Phone, Search } from "lucide-react";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getOwnerListings, type OwnerListing } from "@/lib/listings.functions";

const TITLE = "Anunțuri Proprietari — Habitoo CRM";
const DESCRIPTION =
  "Anunțuri imobiliare direct de la proprietari: apartamente, case și terenuri din toată România, cu preț, suprafață și date de contact.";

// Pagină disponibilă doar utilizatorilor autentificați (sub layout-ul `_authenticated`).
// Nu e indexată de motoarele de căutare și nu apare în sitemap.
export const Route = createFileRoute("/_authenticated/anunturi-proprietari")({
  head: () =>
    publicHead({
      path: "/anunturi-proprietari",
      title: TITLE,
      description: DESCRIPTION,
      noindex: true,
    }),
  loader: () => getOwnerListings(),
  errorComponent: ListingsError,
  notFoundComponent: ListingsError,
  component: ListingsPage,
});

const SOURCE_LABELS: Record<string, string> = {
  storia: "Storia",
  imobiliare: "Imobiliare",
  olx: "OLX",
};

const TRANSACTION_LABELS: Record<string, string> = {
  sale: "Vânzare",
  rent: "Închiriere",
  vânzare: "Vânzare",
  închiriere: "Închiriere",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat("ro", { numeric: "auto" });
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(diffMs / 3_600_000);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  const days = Math.round(diffMs / 86_400_000);
  if (Math.abs(days) < 30) return rtf.format(-days, "day");
  const months = Math.round(diffMs / (30 * 86_400_000));
  if (Math.abs(months) < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.round(months / 12), "year");
}

function formatMoney(value: number | null, currency: string | null): string {
  if (value === null || value === undefined) return "Preț la cerere";
  try {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("ro-RO").format(value)} ${currency ?? "EUR"}`;
  }
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function ListingsError() {
  return (
    <PublicLayout>
      <Section>
        <Container>
          <h1 className="text-2xl font-semibold">Anunțurile nu pot fi afișate acum</h1>
          <p className="mt-2 text-muted-foreground">
            Ne pare rău, a apărut o problemă la încărcarea anunțurilor. Reîncearcă în câteva minute.
          </p>
          <Link to="/" className="mt-4 inline-block text-primary underline">
            Înapoi la pagina principală
          </Link>
        </Container>
      </Section>
    </PublicLayout>
  );
}

function ListingCard({ listing }: { listing: OwnerListing }) {
  const title = listing.title?.trim() || "Anunț fără titlu";
  const location = [listing.location, listing.county].filter(Boolean).join(", ");
  const specs: string[] = [];
  if (listing.rooms !== null) specs.push(`${listing.rooms} camere`);
  if (listing.surface !== null) specs.push(`${listing.surface} m²`);
  const transaction = listing.transactionType
    ? TRANSACTION_LABELS[listing.transactionType] ?? listing.transactionType
    : null;
  const pricePerM2 =
    listing.pricePerM2 !== null && listing.surface !== null
      ? `${formatMoney(listing.pricePerM2, listing.currency)}/m²`
      : null;

  return (
    <Card className="flex h-full flex-col gap-0 transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <Badge variant="secondary">{sourceLabel(listing.source)}</Badge>
        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
          {formatRelative(listing.scrapedAt)}
        </span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">{title}</h3>
          {transaction ? (
            <p className="mt-1 text-xs text-muted-foreground">{transaction}</p>
          ) : null}
        </div>
        <p className="text-xl font-bold tracking-tight text-primary">
          {formatMoney(listing.price, listing.currency)}
        </p>
        {pricePerM2 ? <p className="text-xs text-muted-foreground">{pricePerM2}</p> : null}
        {specs.length ? (
          <p className="text-sm text-foreground/90">{specs.join(" · ")}</p>
        ) : null}
        {location ? (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="line-clamp-1">{location}</span>
          </p>
        ) : null}
        {listing.phone ? (
          <p className="flex items-center gap-1.5 text-sm">
            <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <a href={`tel:${listing.phone}`} className="text-primary underline-offset-2 hover:underline">
              {listing.phone}
            </a>
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="pt-3">
        {listing.url ? (
          <Button asChild className="w-full">
            <a href={listing.url} target="_blank" rel="noopener noreferrer">
              Vezi anunțul
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </Button>
        ) : (
          <Button variant="outline" disabled className="w-full">
            Link indisponibil
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

const TRANSACTION_FILTERS: Record<string, string[] | null> = {
  all: null,
  sale: ["sale", "vânzare", "vanzare"],
  rent: ["rent", "închiriere", "inchiriere"],
};

type Filters = {
  q: string;
  source: string;
  transaction: string;
  priceMin: string;
  priceMax: string;
  rooms: string;
};

const EMPTY_FILTERS: Filters = {
  q: "",
  source: "all",
  transaction: "all",
  priceMin: "",
  priceMax: "",
  rooms: "all",
};

function applyFilters(listings: OwnerListing[], filters: Filters): OwnerListing[] {
  const q = filters.q.trim().toLowerCase();
  const min = filters.priceMin.trim() === "" ? null : Number(filters.priceMin);
  const max = filters.priceMax.trim() === "" ? null : Number(filters.priceMax);
  const transactionValues = TRANSACTION_FILTERS[filters.transaction] ?? null;
  const roomsMin = filters.rooms === "all" || filters.rooms === "" ? null : Number(filters.rooms);

  return listings.filter((listing) => {
    if (q) {
      const haystack = `${listing.title ?? ""} ${listing.location ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.source !== "all" && listing.source !== filters.source) return false;
    if (transactionValues) {
      if (!listing.transactionType || !transactionValues.includes(listing.transactionType)) {
        return false;
      }
    }
    if (listing.price !== null) {
      if (min !== null && !Number.isNaN(min) && listing.price < min) return false;
      if (max !== null && !Number.isNaN(max) && listing.price > max) return false;
    }
    if (roomsMin !== null) {
      if (listing.rooms === null) return false;
      if (filters.rooms === "4+") {
        if (listing.rooms < 4) return false;
      } else if (listing.rooms !== roomsMin) {
        return false;
      }
    }
    return true;
  });
}

function ListingsPage() {
  const listings = Route.useLoaderData();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const filtered = useMemo(() => applyFilters(listings, filters), [listings, filters]);
  const hasActiveFilters =
    filters.q !== "" ||
    filters.source !== "all" ||
    filters.transaction !== "all" ||
    filters.priceMin !== "" ||
    filters.priceMax !== "" ||
    filters.rooms !== "all";

  return (
    <PublicLayout>
      <section className="mk-hero-bg relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="mk-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(60%_60%_at_50%_0%,black,transparent)]"
        />
        <Container className="relative py-12 sm:py-16">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Anunțuri Proprietari
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Anunțuri imobiliare publicate direct de proprietari, adunate din surse publice și
            actualizate zilnic.
          </p>
        </Container>
      </section>

      <Section>
        <Container>
          <div className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="relative xl:col-span-2">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={filters.q}
                onChange={(event) => setFilters((f) => ({ ...f, q: event.target.value }))}
                placeholder="Caută după titlu sau locație…"
                className="pl-9"
                maxLength={200}
                aria-label="Căutare text"
              />
            </div>
            <Select
              value={filters.source}
              onValueChange={(value) => setFilters((f) => ({ ...f, source: value }))}
            >
              <SelectTrigger aria-label="Sursă">
                <SelectValue placeholder="Sursă" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate sursele</SelectItem>
                <SelectItem value="storia">Storia</SelectItem>
                <SelectItem value="imobiliare">Imobiliare</SelectItem>
                <SelectItem value="olx">OLX</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.transaction}
              onValueChange={(value) => setFilters((f) => ({ ...f, transaction: value }))}
            >
              <SelectTrigger aria-label="Tip tranzacție">
                <SelectValue placeholder="Tip tranzacție" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate tranzacțiile</SelectItem>
                <SelectItem value="sale">Vânzare</SelectItem>
                <SelectItem value="rent">Închiriere</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={filters.priceMin}
                onChange={(event) => setFilters((f) => ({ ...f, priceMin: event.target.value }))}
                placeholder="Preț min"
                aria-label="Preț minim"
              />
              <Input
                type="number"
                min={0}
                value={filters.priceMax}
                onChange={(event) => setFilters((f) => ({ ...f, priceMax: event.target.value }))}
                placeholder="Preț max"
                aria-label="Preț maxim"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={filters.rooms}
                onValueChange={(value) => setFilters((f) => ({ ...f, rooms: value }))}
              >
                <SelectTrigger aria-label="Camere" className="flex-1">
                  <SelectValue placeholder="Camere" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate camerele</SelectItem>
                  <SelectItem value="1">1 cameră</SelectItem>
                  <SelectItem value="2">2 camere</SelectItem>
                  <SelectItem value="3">3 camere</SelectItem>
                  <SelectItem value="4+">4+ camere</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilters(EMPTY_FILTERS)}
                disabled={!hasActiveFilters}
              >
                Resetează filtrele
              </Button>
            </div>
          </div>

          <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
            {filtered.length === listings.length
              ? `${listings.length} ${listings.length === 1 ? "anunț" : "anunțuri"}`
              : `${filtered.length} din ${listings.length} ${listings.length === 1 ? "anunț" : "anunțuri"} găsite`}
          </p>

          {listings.length === 0 ? (
            <p className="text-muted-foreground">
              Deocamdată nu există anunțuri de la proprietari. Revino curând.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">
              Niciun anunț nu corespunde filtrelor curente. Încearcă să le relaxezi sau apasă
              „Resetează filtrele”.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </Container>
      </Section>
    </PublicLayout>
  );
}
