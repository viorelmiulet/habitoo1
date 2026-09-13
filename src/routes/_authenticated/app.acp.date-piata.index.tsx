import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Database,
  Filter,
  ImageOff,
  RefreshCw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionCard } from "@/components/app/SectionCard";
import { EmptyState } from "@/components/app/EmptyState";
import { CardGridSkeleton } from "@/components/app/LoadingState";
import { appHead } from "@/components/app/app-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import {
  getMarketOverview,
  importMarketListings,
  listMarketListings,
  resolveDedupeReview,
  listDedupeReviews,
  syncMarketSource,
} from "@/lib/market/market.functions";
import { MARKET_SOURCES } from "@/lib/market/sources";

export const Route = createFileRoute("/_authenticated/app/acp/date-piata/")({
  head: () => appHead("Habitoo CRM — date de piață"),
  component: MarketDataCenterPage,
});

const STATUS_LABEL: Record<string, string> = {
  active: "Activă",
  inactive: "Dispărută din feed",
  archived: "Arhivată",
};

const DEDUPE_LABEL: Record<string, string> = {
  unique: "Unicat",
  merged: "Duplicat unificat",
  ambiguous: "Necesită verificare",
};

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MarketDataCenterPage() {
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(getMarketOverview);
  const listFn = useServerFn(listMarketListings);
  const importFn = useServerFn(importMarketListings);
  const syncFn = useServerFn(syncMarketSource);
  const reviewsFn = useServerFn(listDedupeReviews);
  const resolveFn = useServerFn(resolveDedupeReview);

  const [filters, setFilters] = useState({
    source: "all",
    city: "",
    area: "",
    propertyType: "all",
    transactionType: "all",
    status: "active" as "active" | "inactive" | "archived" | "all",
    priceMin: "",
    priceMax: "",
    areaMin: "",
    areaMax: "",
    rooms: "",
  });
  const [page, setPage] = useState(1);

  const [importSource, setImportSource] = useState(MARKET_SOURCES[0]?.id ?? "habitoo_internal");
  const [importFormat, setImportFormat] = useState<"json" | "csv">("json");
  const [importContent, setImportContent] = useState("");
  const [fullFeed, setFullFeed] = useState(false);

  const overview = useQuery({ queryKey: ["market-overview"], queryFn: () => overviewFn({}) });
  const isSuperadmin = overview.data?.isSuperadmin ?? false;

  const listingQuery = useMemo(
    () => ({
      source: filters.source === "all" ? undefined : filters.source,
      city: filters.city || undefined,
      area: filters.area || undefined,
      propertyType: filters.propertyType === "all" ? undefined : filters.propertyType,
      transactionType: filters.transactionType === "all" ? undefined : filters.transactionType,
      status: filters.status,
      priceMin: filters.priceMin ? Number(filters.priceMin) : undefined,
      priceMax: filters.priceMax ? Number(filters.priceMax) : undefined,
      areaMin: filters.areaMin ? Number(filters.areaMin) : undefined,
      areaMax: filters.areaMax ? Number(filters.areaMax) : undefined,
      rooms: filters.rooms ? Number(filters.rooms) : undefined,
      page,
    }),
    [filters, page],
  );

  const listings = useQuery({
    queryKey: ["market-listings", listingQuery],
    queryFn: () => listFn({ data: listingQuery }),
  });

  const reviews = useQuery({
    queryKey: ["market-dedupe-reviews"],
    enabled: isSuperadmin,
    queryFn: () => reviewsFn({}),
  });

  const runImport = useMutation({
    mutationFn: () =>
      importFn({
        data: {
          source: importSource,
          format: importFormat,
          content: importContent,
          mode: fullFeed ? "full" : "partial",
        },
      }),
    onSuccess: (result) => {
      toast.success(`Import ${result.sourceName}: ${result.created} noi, ${result.updated} actualizate, ${result.invalid} invalide.`, { duration: 2500 });
      setImportContent("");
      void queryClient.invalidateQueries({ queryKey: ["market-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["market-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["market-dedupe-reviews"] });
    },
    onError: (error: unknown) => toastError(error),
  });

  const sync = useMutation({
    mutationFn: (source: string) => syncFn({ data: { source } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["market-overview"] });
    },
    onError: (error: unknown) => toastError(error),
  });

  const resolve = useMutation({
    mutationFn: (input: { id: string; decision: "confirm" | "reject" }) =>
      resolveFn({ data: input }),
    onSuccess: () => {
      toast.success("Potrivirea a fost rezolvată.", { duration: 2500 });
      void queryClient.invalidateQueries({ queryKey: ["market-dedupe-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["market-overview"] });
    },
    onError: (error: unknown) => toastError(error),
  });

  const totals = overview.data?.totals;
  const rows = listings.data?.rows ?? [];
  const total = listings.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ACP"
        title="Date de piață"
        description="Ofertele importate din surse autorizate, normalizate, deduplicate și urmărite în timp. Baza de comparație pentru analizele ACP."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Oferte importate" value={String(totals?.total ?? 0)} />
        <StatCard
          label="Oferte active"
          value={String(totals?.active ?? 0)}
          hint={`${totals?.newLast7Days ?? 0} noi în 7 zile`}
        />
        <StatCard
          label="Proprietăți distincte"
          value={String(totals?.entities ?? 0)}
          hint={`${totals?.duplicates ?? 0} anunțuri unificate`}
        />
        <StatCard
          label="De verificat"
          value={String(totals?.ambiguous ?? 0)}
          hint={`${totals?.updatedLast7Days ?? 0} modificate în 7 zile`}
        />
      </div>

      <SectionCard title="Surse configurate" icon={Database}>
        <div className="space-y-3">
          {(overview.data?.sources ?? []).map((source) => (
            <div
              key={source.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{source.name}</p>
                  <Badge variant="outline">{source.formats.join(" / ").toUpperCase()}</Badge>
                  {source.pull ? (
                    <Badge variant="secondary">Import automat</Badge>
                  ) : (
                    <Badge variant="outline">Import din fișier</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{source.description}</p>
                {source.notes ? (
                  <p className="mt-1 text-xs text-muted-foreground">{source.notes}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  {source.total} oferte · {source.active} active
                </span>
                <span className="text-muted-foreground">
                  Ultima sincronizare: {dateLabel(source.lastImportAt ?? source.lastSeenAt)}
                </span>
                {isSuperadmin ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sync.isPending}
                    onClick={() => sync.mutate(source.id)}
                  >
                    <RefreshCw className="size-4" /> Sincronizează
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {isSuperadmin ? (
        <SectionCard
          title="Import date de piață"
          icon={Upload}
          description="Încarcă exportul JSON sau CSV primit de la sursă. Importul este idempotent: aceleași oferte nu se dublează."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Sursă</Label>
              <Select value={importSource} onValueChange={setImportSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKET_SOURCES.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={importFormat}
                onValueChange={(value) => setImportFormat(value as "json" | "csv")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="market-import-content">Conținutul fișierului</Label>
            <Textarea
              id="market-import-content"
              rows={8}
              value={importContent}
              onChange={(event) => setImportContent(event.target.value)}
              placeholder='[{"id":"1234","address":"Strada Aviatorilor 5","city":"Bucuresti","rooms":3,"usable_area":78,"price":185000,"currency":"EUR"}]'
              className="font-mono text-xs"
            />
            <div className="flex items-start gap-2">
              <Checkbox
                id="market-full-feed"
                checked={fullFeed}
                onCheckedChange={(checked) => setFullFeed(checked === true)}
              />
              <Label htmlFor="market-full-feed" className="text-sm font-normal leading-snug">
                Feed complet: ofertele sursei care nu apar în fișier vor fi marcate ca dispărute
                (istoricul se păstrează).
              </Label>
            </div>
            <div>
              <input
                type="file"
                accept=".json,.csv,text/csv,application/json"
                className="text-sm"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  setImportContent(text);
                  setImportFormat(file.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
                }}
              />
            </div>
            <Button
              onClick={() => runImport.mutate()}
              disabled={runImport.isPending || importContent.trim().length < 2}
            >
              <Upload className="size-4" />
              {runImport.isPending ? "Se importă…" : "Importă ofertele"}
            </Button>
          </div>

          {(overview.data?.lastRuns ?? []).length > 0 ? (
            <div className="mt-6 space-y-2">
              <p className="text-sm font-medium text-foreground">Ultimele rulări</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4">Sursă</th>
                      <th className="py-2 pr-4">Când</th>
                      <th className="py-2 pr-4">Primite</th>
                      <th className="py-2 pr-4">Noi</th>
                      <th className="py-2 pr-4">Actualizate</th>
                      <th className="py-2 pr-4">Invalide</th>
                      <th className="py-2 pr-4">Dispărute</th>
                      <th className="py-2 pr-4">Duplicate</th>
                      <th className="py-2 pr-4">Erori</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(overview.data?.lastRuns ?? []).map((run) => (
                      <tr key={run.id}>
                        <td className="py-2 pr-4">{run.sourceName}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {dateLabel(run.startedAt)}
                        </td>
                        <td className="py-2 pr-4">{run.itemsReceived}</td>
                        <td className="py-2 pr-4">{run.itemsCreated}</td>
                        <td className="py-2 pr-4">{run.itemsUpdated}</td>
                        <td className="py-2 pr-4">{run.itemsInvalid}</td>
                        <td className="py-2 pr-4">{run.itemsDeactivated}</td>
                        <td className="py-2 pr-4">{run.duplicates}</td>
                        <td className="py-2 pr-4">{run.errorCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {isSuperadmin && (reviews.data ?? []).length > 0 ? (
        <SectionCard
          title="Potriviri ambigue"
          icon={ShieldAlert}
          description="Oferte care ar putea fi aceeași proprietate, dar fără dovezi suficiente pentru unificare automată."
        >
          <div className="space-y-3">
            {(reviews.data ?? []).map((review) => (
              <div key={review.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {review.listing?.title ?? review.listing?.address ?? "Ofertă de piață"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[review.listing?.city, review.listing?.usable_area
                        ? `${review.listing.usable_area} mp`
                        : null, review.listing?.rooms ? `${review.listing.rooms} camere` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {review.reasons.map((reason, index) => (
                        <li key={index}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Scor {Math.round(Number(review.score ?? 0))}</Badge>
                    <Button
                      size="sm"
                      onClick={() => resolve.mutate({ id: review.id, decision: "confirm" })}
                      disabled={resolve.isPending}
                    >
                      Aceeași proprietate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolve.mutate({ id: review.id, decision: "reject" })}
                      disabled={resolve.isPending}
                    >
                      Proprietăți diferite
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Ofertele de piață" icon={Filter}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs">Sursă</Label>
            <Select
              value={filters.source}
              onValueChange={(value) => {
                setPage(1);
                setFilters((f) => ({ ...f, source: value }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate sursele</SelectItem>
                {MARKET_SOURCES.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Oraș</Label>
            <Input
              value={filters.city}
              onChange={(event) => {
                setPage(1);
                setFilters((f) => ({ ...f, city: event.target.value }));
              }}
              placeholder="București"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Zonă / adresă</Label>
            <Input
              value={filters.area}
              onChange={(event) => {
                setPage(1);
                setFilters((f) => ({ ...f, area: event.target.value }));
              }}
              placeholder="Aviatorilor"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tip</Label>
            <Select
              value={filters.propertyType}
              onValueChange={(value) => {
                setPage(1);
                setFilters((f) => ({ ...f, propertyType: value }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate tipurile</SelectItem>
                <SelectItem value="apartament">Apartament</SelectItem>
                <SelectItem value="casa">Casă</SelectItem>
                <SelectItem value="teren">Teren</SelectItem>
                <SelectItem value="spatiu comercial">Spațiu comercial</SelectItem>
                <SelectItem value="birou">Birou</SelectItem>
                <SelectItem value="hala">Hală</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tranzacție</Label>
            <Select
              value={filters.transactionType}
              onValueChange={(value) => {
                setPage(1);
                setFilters((f) => ({ ...f, transactionType: value }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate</SelectItem>
                <SelectItem value="sale">Vânzare</SelectItem>
                <SelectItem value="rent">Închiriere</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select
              value={filters.status}
              onValueChange={(value) => {
                setPage(1);
                setFilters((f) => ({ ...f, status: value as typeof filters.status }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Dispărute</SelectItem>
                <SelectItem value="archived">Arhivate</SelectItem>
                <SelectItem value="all">Toate</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preț minim</Label>
            <Input
              inputMode="numeric"
              value={filters.priceMin}
              onChange={(event) => setFilters((f) => ({ ...f, priceMin: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preț maxim</Label>
            <Input
              inputMode="numeric"
              value={filters.priceMax}
              onChange={(event) => setFilters((f) => ({ ...f, priceMax: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Suprafață min.</Label>
            <Input
              inputMode="numeric"
              value={filters.areaMin}
              onChange={(event) => setFilters((f) => ({ ...f, areaMin: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Suprafață max.</Label>
            <Input
              inputMode="numeric"
              value={filters.areaMax}
              onChange={(event) => setFilters((f) => ({ ...f, areaMax: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Camere</Label>
            <Input
              inputMode="numeric"
              value={filters.rooms}
              onChange={(event) => setFilters((f) => ({ ...f, rooms: event.target.value }))}
            />
          </div>
        </div>

        <div className="mt-5">
          {listings.isLoading ? (
            <CardGridSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Nicio ofertă de piață"
              description="Importă un export JSON sau CSV dintr-o sursă autorizată pentru a construi baza de comparație."
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    to="/app/acp/date-piata/$id"
                    params={{ id: row.id }}
                    className="flex h-full gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm"
                  >
                    <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                      {row.imageUrl ? (
                        <img
                          src={row.imageUrl}
                          alt={row.title ?? "Ofertă de piață"}
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          <ImageOff className="size-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {row.title ?? row.city ?? "Ofertă de piață"}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {[row.neighborhood ?? row.district, row.city].filter(Boolean).join(", ") ||
                          "Locație necunoscută"}
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {row.price
                          ? formatMoney(row.price, row.currency ?? "EUR")
                          : "Preț necomunicat"}
                        {row.pricePerSqm ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {Math.round(row.pricePerSqm)} /mp
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        <Badge variant="outline">{row.sourceName}</Badge>
                        {row.rooms ? <Badge variant="outline">{row.rooms} camere</Badge> : null}
                        {row.usableArea ? (
                          <Badge variant="outline">{row.usableArea} mp</Badge>
                        ) : null}
                        <Badge variant={row.status === "active" ? "secondary" : "outline"}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                        {row.dedupeStatus !== "unique" ? (
                          <Badge variant="outline">{DEDUPE_LABEL[row.dedupeStatus]}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Pagina {page} din {pages} · {total} oferte
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Următor
              </Button>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
