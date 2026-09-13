import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, History, ImageOff, Layers, MapPin, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionCard } from "@/components/app/SectionCard";
import { CardGridSkeleton } from "@/components/app/LoadingState";
import { appHead } from "@/components/app/app-head";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { getMarketListingDetail } from "@/lib/market/market.functions";

export const Route = createFileRoute("/_authenticated/app/acp/date-piata/$id")({
  head: () => appHead("Habitoo CRM — detaliu ofertă de piață"),
  component: MarketListingDetailPage,
  errorComponent: () => (
    <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
      Oferta de piață nu a putut fi încărcată.
    </div>
  ),
  notFoundComponent: () => (
    <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
      Oferta de piață nu a fost găsită.
    </div>
  ),
});

const STATUS_LABEL: Record<string, string> = {
  active: "Activă",
  inactive: "Dispărută din feed",
  archived: "Arhivată",
};

const CHANGE_LABEL: Record<string, string> = {
  first_import: "Prima înregistrare",
  price: "Modificare de preț",
  status: "Modificare de status",
  reappeared: "Reapărută în feed",
  disappeared: "Dispărută din feed",
  import: "Import",
};

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );
}

function MarketListingDetailPage() {
  const { id } = Route.useParams();
  const detailFn = useServerFn(getMarketListingDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["market-listing", id],
    queryFn: () => detailFn({ data: { id } }),
  });

  if (isLoading || !data) return <CardGridSkeleton />;
  const { listing, history, sources, snapshots, entity, siblings, rawJson, canSeeRaw } = data;
  const features = Object.entries(listing.features).filter(([, value]) => value);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Date de piață"
        backTo="/app/acp/date-piata"
        title={listing.title ?? listing.address ?? "Ofertă de piață"}
        description={[listing.neighborhood ?? listing.district, listing.city, listing.county]
          .filter(Boolean)
          .join(", ")}
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{listing.sourceName}</Badge>
            <Badge variant={listing.status === "active" ? "secondary" : "outline"}>
              {STATUS_LABEL[listing.status] ?? listing.status}
            </Badge>
            {listing.url ? (
              <a
                href={listing.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Deschide anunțul <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <SectionCard title="Informații normalizate" icon={MapPin}>
            <div className="mb-4 aspect-[16/9] w-full overflow-hidden rounded-xl border border-border bg-muted">
              {listing.imageUrl ? (
                <img
                  src={listing.imageUrl}
                  alt={listing.title ?? "Ofertă de piață"}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageOff className="size-6" />
                  <span className="text-sm">Sursa nu a furnizat o fotografie</span>
                </div>
              )}
            </div>
            <div className="grid gap-x-8 md:grid-cols-2">
              <div>
                <Row label="Tip proprietate" value={listing.propertyType} />
                <Row
                  label="Tranzacție"
                  value={
                    listing.transactionType === "sale"
                      ? "Vânzare"
                      : listing.transactionType === "rent"
                        ? "Închiriere"
                        : listing.transactionType
                  }
                />
                <Row label="Adresă" value={listing.address} />
                <Row label="Camere" value={listing.rooms} />
                <Row label="Băi" value={listing.bathrooms} />
                <Row
                  label="Suprafață utilă"
                  value={listing.usableArea ? `${listing.usableArea} mp` : null}
                />
                <Row
                  label="Suprafață totală"
                  value={listing.totalArea ? `${listing.totalArea} mp` : null}
                />
              </div>
              <div>
                <Row
                  label="Etaj"
                  value={
                    listing.floor === null
                      ? null
                      : `${listing.floor}${listing.totalFloors ? ` / ${listing.totalFloors}` : ""}`
                  }
                />
                <Row label="An construcție" value={listing.constructionYear} />
                <Row label="Stare" value={listing.condition} />
                <Row
                  label="Preț"
                  value={
                    listing.price ? formatMoney(listing.price, listing.currency ?? "EUR") : null
                  }
                />
                <Row
                  label="Preț / mp"
                  value={listing.pricePerSqm ? `${Math.round(listing.pricePerSqm)}` : null}
                />
                <Row
                  label="Mobilat / parcare / balcon"
                  value={[
                    listing.furnished === null ? "—" : listing.furnished ? "da" : "nu",
                    listing.parking === null ? "—" : listing.parking ? "da" : "nu",
                    listing.balcony === null ? "—" : listing.balcony ? "da" : "nu",
                  ].join(" · ")}
                />
                <Row
                  label="Coordonate"
                  value={
                    listing.latitude && listing.longitude
                      ? `${listing.latitude}, ${listing.longitude}`
                      : null
                  }
                />
              </div>
            </div>
            {features.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {features.map(([key]) => (
                  <Badge key={key} variant="outline">
                    {key}
                  </Badge>
                ))}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Istoricul prețului și al statusului" icon={History}>
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Preț inițial</p>
                <p className="text-lg font-semibold">
                  {history.initialPrice
                    ? formatMoney(history.initialPrice, listing.currency ?? "EUR")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Preț actual</p>
                <p className="text-lg font-semibold">
                  {history.currentPrice
                    ? formatMoney(history.currentPrice, listing.currency ?? "EUR")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Reducere</p>
                <p className="text-lg font-semibold">
                  {history.totalDiscount && history.totalDiscount > 0
                    ? `${formatMoney(history.totalDiscount, listing.currency ?? "EUR")} (${history.discountPercent}%)`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Zile în piață</p>
                <p className="text-lg font-semibold">{history.daysOnMarket ?? "—"}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {history.priceChanges} modificări de preț · {history.statusChanges} modificări de
              status · prima apariție {dateLabel(listing.firstSeenAt)} · ultima confirmare{" "}
              {dateLabel(listing.lastSeenAt)}
              {listing.disappearedAt ? ` · dispărută ${dateLabel(listing.disappearedAt)}` : ""}
            </p>
            <ul className="mt-4 space-y-2">
              {snapshots.map((snapshot) => (
                <li
                  key={snapshot.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">
                    {CHANGE_LABEL[snapshot.changeType] ?? snapshot.changeType}
                  </span>
                  <span className="text-muted-foreground">
                    {snapshot.previousPrice && snapshot.price
                      ? `${formatMoney(snapshot.previousPrice, snapshot.currency ?? "EUR")} → ${formatMoney(snapshot.price, snapshot.currency ?? "EUR")}`
                      : snapshot.price
                        ? formatMoney(snapshot.price, snapshot.currency ?? "EUR")
                        : "fără preț"}
                    {snapshot.previousStatus && snapshot.previousStatus !== snapshot.status
                      ? ` · ${STATUS_LABEL[snapshot.previousStatus] ?? snapshot.previousStatus} → ${(snapshot.status ? STATUS_LABEL[snapshot.status] : null) ?? snapshot.status}`
                      : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateLabel(snapshot.capturedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Surse" icon={Layers}>
            <ul className="space-y-3">
              {sources.map((source) => (
                <li key={source.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{source.sourceName}</span>
                    {source.isPrimary ? <Badge variant="secondary">principală</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ID sursă: {source.sourceListingId ?? "—"}
                  </p>
                  {source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {source.url} <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dateLabel(source.firstSeenAt)} → {dateLabel(source.lastSeenAt)}
                    {source.isActive ? "" : " · inactivă"}
                  </p>
                </li>
              ))}
            </ul>
            {siblings.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">Aceeași proprietate, alte anunțuri</p>
                {siblings.map((sibling) => (
                  <Link
                    key={sibling.id}
                    to="/app/acp/date-piata/$id"
                    params={{ id: sibling.id }}
                    className="block rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40"
                  >
                    {sibling.sourceName} ·{" "}
                    {sibling.price ? formatMoney(sibling.price, sibling.currency ?? "EUR") : "—"} ·{" "}
                    {STATUS_LABEL[sibling.status] ?? sibling.status}
                  </Link>
                ))}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Deduplicare" icon={ShieldCheck}>
            <Row
              label="Stare"
              value={
                listing.dedupeStatus === "merged"
                  ? "Duplicat unificat"
                  : listing.dedupeStatus === "ambiguous"
                    ? "Necesită verificare manuală"
                    : "Unicat"
              }
            />
            <Row
              label="Scor potrivire"
              value={listing.dedupeScore ? Math.round(Number(listing.dedupeScore)) : null}
            />
            <Row label="Entitate canonică" value={entity ? entity.id.slice(0, 8) : "—"} />
            <Row label="Anunțuri în entitate" value={entity?.listingCount ?? 1} />
            {listing.dedupeReasons.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {listing.dedupeReasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </SectionCard>

          {canSeeRaw && rawJson ? (
            <SectionCard
              title="Date brute de la sursă"
              description="Valorile originale ale câmpurilor mapate, fără date de contact."
            >
              <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs">
                {rawJson}
              </pre>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
