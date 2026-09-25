import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, MapPin, Phone } from "lucide-react";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { getOwnerListings, type OwnerListing } from "@/lib/listings.functions";

const TITLE = "Anunțuri Proprietari — Habitoo CRM";
const DESCRIPTION =
  "Anunțuri imobiliare direct de la proprietari: apartamente, case și terenuri din toată România, cu preț, suprafață și date de contact.";

export const Route = createFileRoute("/anunturi-proprietari")({
  head: () =>
    publicHead({
      path: "/anunturi-proprietari",
      title: TITLE,
      description: DESCRIPTION,
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

function ListingsPage() {
  const listings = Route.useLoaderData();

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
          {listings.length === 0 ? (
            <p className="text-muted-foreground">
              Deocamdată nu există anunțuri de la proprietari. Revino curând.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </Container>
      </Section>
    </PublicLayout>
  );
}
