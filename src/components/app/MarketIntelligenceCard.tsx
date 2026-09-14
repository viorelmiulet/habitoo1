/**
 * Market Intelligence (ACP Stage 4) — prezentare.
 *
 * Componenta nu calculează nimic: afișează exact ce returnează serverul.
 * Când datele sunt insuficiente, spune explicit de ce, fără metrici inventate.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarClock,
  Filter,
  Gauge,
  Info,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getAcpMarketIntelligence,
  getMarketIntelligence,
} from "@/lib/market/intelligence.functions";
import type { AcpMarketInsights } from "@/lib/market/intelligence";
import type { MarketIntelligenceResult } from "@/lib/market/intelligence.server";
import type {
  MarketDistributionBucket,
  MarketFreshness,
  MarketIntelligenceAggregate,
  MarketNumericStats,
  MarketPosition,
  MarketSourceQuality,
  MarketTrend,
} from "@/lib/market/intelligence";

type FilterState = {
  city: string;
  area: string;
  propertyType: string;
  transactionType: string;
  roomsMin: string;
  roomsMax: string;
  areaMin: string;
  areaMax: string;
  priceMin: string;
  priceMax: string;
  pricePerSqmMin: string;
  pricePerSqmMax: string;
  source: string;
  status: "active" | "inactive" | "archived" | "all";
  window: string;
};

const EMPTY_FILTERS: FilterState = {
  city: "",
  area: "",
  propertyType: "all",
  transactionType: "all",
  roomsMin: "",
  roomsMax: "",
  areaMin: "",
  areaMax: "",
  priceMin: "",
  priceMax: "",
  pricePerSqmMin: "",
  pricePerSqmMax: "",
  source: "all",
  status: "active",
  window: "all",
};

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

const FRESHNESS_LABEL: Record<MarketFreshness["level"], string> = {
  fresh: "Date proaspete",
  aging: "Date în curs de învechire",
  stale: "Date învechite",
  unknown: "Prospețime necunoscută",
};

const FRESHNESS_TONE: Record<MarketFreshness["level"], string> = {
  fresh: "bg-success/12 text-success",
  aging: "bg-warning/18 text-warning-foreground",
  stale: "bg-destructive/10 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

const COVERAGE_LABEL: Record<MarketIntelligenceAggregate["coverage"]["level"], string> = {
  good: "Acoperire bună",
  partial: "Acoperire parțială",
  poor: "Acoperire slabă",
  unknown: "Acoperire necunoscută",
};

const BAND_TONE: Record<MarketPosition["band"], string> = {
  under: "bg-info/12 text-info",
  in: "bg-success/12 text-success",
  over: "bg-warning/18 text-warning-foreground",
  unknown: "bg-muted text-muted-foreground",
};

function money(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : formatMoney(value);
}

function perSqm(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${formatMoney(value)}/mp`;
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Distribution({
  title,
  buckets,
  available,
  formatLabel,
}: {
  title: string;
  buckets: MarketDistributionBucket[];
  available: boolean;
  formatLabel?: (bucket: MarketDistributionBucket) => string;
}) {
  if (!available || buckets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase">{title}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Date insuficiente pentru distribuție.
        </p>
      </div>
    );
  }
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase">{title}</p>
      <ul className="mt-3 space-y-2">
        {buckets.map((bucket) => (
          <li key={bucket.key} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {formatLabel ? formatLabel(bucket) : bucket.label}
            </span>
            <span className="h-2 rounded-full bg-muted" aria-hidden>
              <span
                className="block h-2 rounded-full bg-primary"
                style={{ width: `${Math.max(2, (bucket.count / max) * 100)}%` }}
              />
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatNumber(bucket.count)} · {bucket.share.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatsRow({ label, stats, unit }: { label: string; stats: MarketNumericStats; unit: "eur" | "sqm" }) {
  const fmt = (value: number | null) =>
    value === null ? "—" : unit === "eur" ? formatMoney(value) : `${formatNumber(value)} mp`;
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-3 text-xs font-medium">{label}</td>
      <td className="py-2 pr-3 text-xs tabular-nums">{fmt(stats.min)}</td>
      <td className="py-2 pr-3 text-xs tabular-nums">{fmt(stats.p25)}</td>
      <td className="py-2 pr-3 text-xs tabular-nums">{fmt(stats.median)}</td>
      <td className="py-2 pr-3 text-xs tabular-nums">{fmt(stats.average)}</td>
      <td className="py-2 pr-3 text-xs tabular-nums">{fmt(stats.p75)}</td>
      <td className="py-2 text-xs tabular-nums">{fmt(stats.max)}</td>
    </tr>
  );
}

function PositionBadge({ position, title }: { position: MarketPosition; title: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
        <Badge className={cn("border-transparent", BAND_TONE[position.band])}>{position.label}</Badge>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{perSqm(position.valuePerSqm)}</p>
      {position.band === "unknown" ? (
        <p className="mt-1 text-xs text-muted-foreground">{position.reason}</p>
      ) : (
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          <p>
            Față de mediana pieței ({perSqm(position.medianPerSqm)}):{" "}
            <span className="font-medium tabular-nums text-foreground">
              {percent(position.deltaVsMedianPercent)}
            </span>
          </p>
          <p>
            Față de media pieței ({perSqm(position.averagePerSqm)}):{" "}
            {percent(position.deltaVsAveragePercent)}
          </p>
          {position.percentileRank !== null ? (
            <p>
              Poziție în distribuție: percentila {position.percentileRank.toFixed(1)} · prag ±
              {position.thresholdPercent}%
            </p>
          ) : (
            <p>Prag sub/în/peste piață: ±{position.thresholdPercent}%</p>
          )}
        </div>
      )}
    </div>
  );
}

function TrendBlock({ trend }: { trend: MarketTrend | null }) {
  if (!trend || (!trend.available && trend.points.length === 0)) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
        {trend?.reason ??
          "Date istorice insuficiente: trendurile devin disponibile după mai multe sincronizări."}
      </div>
    );
  }
  const values = trend.points
    .map((p) => p.medianPricePerSqm)
    .filter((v): v is number => typeof v === "number");
  const max = values.length ? Math.max(...values) : 1;
  return (
    <div className="space-y-3">
      {trend.available ? (
        <p className="text-xs text-muted-foreground">
          Variația medianei €/mp pe intervalul cu date reale:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {percent(trend.changePercent)}
          </span>
        </p>
      ) : (
        <p className="text-xs text-warning-foreground">{trend.reason}</p>
      )}
      <ul className="space-y-2">
        {trend.points.map((point) => (
          <li key={point.bucket} className="grid grid-cols-[5rem_1fr_auto] items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">{point.bucket}</span>
            <span className="h-2 rounded-full bg-muted" aria-hidden>
              <span
                className="block h-2 rounded-full bg-accent"
                style={{
                  width: `${Math.max(2, ((point.medianPricePerSqm ?? 0) / max) * 100)}%`,
                }}
              />
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {perSqm(point.medianPricePerSqm)} · {formatNumber(point.listings)} anunțuri
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceQualityTable({
  sources,
  names,
}: {
  sources: MarketSourceQuality[];
  names: Record<string, string>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-left">
        <thead>
          <tr className="text-xs text-muted-foreground uppercase">
            <th className="pb-2 pr-3 font-medium">Sursă</th>
            <th className="pb-2 pr-3 font-medium">Stare</th>
            <th className="pb-2 pr-3 font-medium">Ultima sincronizare</th>
            <th className="pb-2 pr-3 font-medium">Anunțuri</th>
            <th className="pb-2 pr-3 font-medium">Duplicate</th>
            <th className="pb-2 pr-3 font-medium">Respinse</th>
            <th className="pb-2 font-medium">Prospețime</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.id} className="border-t border-border">
              <td className="py-2 pr-3 text-xs font-medium">{names[source.id] ?? source.name}</td>
              <td className="py-2 pr-3 text-xs">
                {source.configured ? (
                  <Badge variant="secondary">{source.syncStatus ?? "configurată"}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Neconfigurată
                  </Badge>
                )}
                {source.lastError ? (
                  <span className="mt-1 block text-xs text-destructive">{source.lastError}</span>
                ) : null}
              </td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">
                {source.lastSuccessAt || source.lastSyncAt
                  ? formatDateTime(source.lastSuccessAt ?? source.lastSyncAt)
                  : "—"}
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {formatNumber(source.recordsActive)} / {formatNumber(source.recordsTotal)}
                {source.sharePercent !== null ? (
                  <span className="block text-muted-foreground">
                    {source.sharePercent.toFixed(1)}% din selecție
                  </span>
                ) : null}
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {formatNumber(source.recordsDeduplicated)}
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {source.recordsRejected === null ? "—" : formatNumber(source.recordsRejected)}
              </td>
              <td className="py-2 text-xs">
                <span
                  className={cn(
                    "inline-flex rounded-md px-1.5 py-0.5 font-medium",
                    FRESHNESS_TONE[source.freshness.level],
                  )}
                >
                  {FRESHNESS_LABEL[source.freshness.level]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Panou Market Intelligence. Cu `analysisId` afișează și poziționarea
 * proprietății analizate față de piață; fără el, piața globală filtrabilă.
 */
export function MarketIntelligenceCard({
  analysisId,
  className,
}: {
  analysisId?: string;
  className?: string;
}) {
  const globalFn = useServerFn(getMarketIntelligence);
  const acpFn = useServerFn(getAcpMarketIntelligence);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const payloadFilters = useMemo(
    () => ({
      city: filters.city.trim() || null,
      area: filters.area.trim() || null,
      propertyType: filters.propertyType === "all" ? null : filters.propertyType,
      transactionType: filters.transactionType === "all" ? null : filters.transactionType,
      roomsMin: numberOrUndefined(filters.roomsMin) ?? null,
      roomsMax: numberOrUndefined(filters.roomsMax) ?? null,
      areaMin: numberOrUndefined(filters.areaMin) ?? null,
      areaMax: numberOrUndefined(filters.areaMax) ?? null,
      priceMin: numberOrUndefined(filters.priceMin) ?? null,
      priceMax: numberOrUndefined(filters.priceMax) ?? null,
      pricePerSqmMin: numberOrUndefined(filters.pricePerSqmMin) ?? null,
      pricePerSqmMax: numberOrUndefined(filters.pricePerSqmMax) ?? null,
      sources: filters.source === "all" ? null : [filters.source],
      status: filters.status,
      seenWithinDays: filters.window === "all" ? null : Number(filters.window),
    }),
    [filters],
  );

  /** În modul ACP trimitem doar suprascrierile explicite: restul vine din proprietate. */
  const acpOverrides = useMemo(() => {
    const overrides: Record<string, unknown> = { status: filters.status };
    for (const [key, value] of Object.entries(payloadFilters)) {
      if (key === "status") continue;
      if (value === null || value === undefined) continue;
      overrides[key] = value;
    }
    return overrides;
  }, [payloadFilters, filters.status]);

  const query = useQuery<{
    result: MarketIntelligenceResult;
    insights: AcpMarketInsights | null;
  }>({
    queryKey: [
      "market-intelligence",
      analysisId ?? "global",
      analysisId ? acpOverrides : payloadFilters,
    ],
    queryFn: async () => {
      if (analysisId) {
        const data = await acpFn({ data: { analysisId, filters: acpOverrides } });
        return { result: data.live, insights: data.insights };
      }
      const data = await globalFn({ data: { filters: payloadFilters } });
      return { result: data, insights: null };
    },
  });

  const result = query.data?.result ?? null;
  const insights = query.data?.insights ?? null;
  const aggregate = result?.aggregate ?? null;

  const filterRow = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-xs">Localitate</Label>
        <Input
          value={filters.city}
          onChange={(event) => setFilters((f) => ({ ...f, city: event.target.value }))}
          placeholder="București"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Zonă / cartier</Label>
        <Input
          value={filters.area}
          onChange={(event) => setFilters((f) => ({ ...f, area: event.target.value }))}
          placeholder="Aviatorilor"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Tip proprietate</Label>
        <Select
          value={filters.propertyType}
          onValueChange={(value) => setFilters((f) => ({ ...f, propertyType: value }))}
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
          onValueChange={(value) => setFilters((f) => ({ ...f, transactionType: value }))}
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
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Camere min.</Label>
          <Input
            inputMode="numeric"
            value={filters.roomsMin}
            onChange={(event) => setFilters((f) => ({ ...f, roomsMin: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Camere max.</Label>
          <Input
            inputMode="numeric"
            value={filters.roomsMax}
            onChange={(event) => setFilters((f) => ({ ...f, roomsMax: event.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
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
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Preț min.</Label>
          <Input
            inputMode="numeric"
            value={filters.priceMin}
            onChange={(event) => setFilters((f) => ({ ...f, priceMin: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Preț max.</Label>
          <Input
            inputMode="numeric"
            value={filters.priceMax}
            onChange={(event) => setFilters((f) => ({ ...f, priceMax: event.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">€/mp min.</Label>
          <Input
            inputMode="numeric"
            value={filters.pricePerSqmMin}
            onChange={(event) => setFilters((f) => ({ ...f, pricePerSqmMin: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">€/mp max.</Label>
          <Input
            inputMode="numeric"
            value={filters.pricePerSqmMax}
            onChange={(event) => setFilters((f) => ({ ...f, pricePerSqmMax: event.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Sursă</Label>
        <Select
          value={filters.source}
          onValueChange={(value) => setFilters((f) => ({ ...f, source: value }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate sursele</SelectItem>
            {(result?.sources ?? []).map((source) => (
              <SelectItem key={source.id} value={source.id}>
                {source.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Status anunț</Label>
        <Select
          value={filters.status}
          onValueChange={(value) =>
            setFilters((f) => ({ ...f, status: value as FilterState["status"] }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Dispărute din feed</SelectItem>
            <SelectItem value="archived">Arhivate</SelectItem>
            <SelectItem value="all">Toate</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Fereastră temporală</Label>
        <Select
          value={filters.window}
          onValueChange={(value) => setFilters((f) => ({ ...f, window: value }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Fără limită</SelectItem>
            <SelectItem value="7">Văzute în 7 zile</SelectItem>
            <SelectItem value="30">Văzute în 30 zile</SelectItem>
            <SelectItem value="90">Văzute în 90 zile</SelectItem>
            <SelectItem value="365">Văzute în 12 luni</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end">
        <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
          Resetează filtrele
        </Button>
      </div>
    </div>
  );

  return (
    <SectionCard
      className={className}
      icon={BarChart3}
      title="Informații de piață"
      description={
        analysisId
          ? "Piața din jurul proprietății analizate, calculată din datele reale importate."
          : "Statistici deterministe pe pool-ul de oferte importate."
      }
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="mr-1.5 size-4" />
            {showFilters ? "Ascunde filtrele" : "Filtre"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={cn("mr-1.5 size-4", query.isFetching && "animate-spin")} />
            Reîmprospătează
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {showFilters ? filterRow : null}

        {query.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={Info}
            title="Informațiile de piață nu au putut fi încărcate"
            description={query.error instanceof Error ? query.error.message : "Eroare necunoscută."}
          />
        ) : !aggregate || !result ? null : (
          <>
            {aggregate.totalMatched === 0 ? (
              <EmptyState
                icon={Building2}
                title="Nu există încă oferte de piață pentru această selecție"
                description="Pool-ul de piață se populează la sincronizarea surselor sau la un import. Până atunci nu afișăm statistici estimate."
              />
            ) : (
              <>
                {aggregate.insufficient ? (
                  <p className="rounded-lg bg-warning/12 px-3 py-2 text-xs text-warning-foreground">
                    {aggregate.insufficientReason}
                  </p>
                ) : null}

                {insights ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <PositionBadge position={insights.property} title="Prețul proprietății" />
                    <PositionBadge position={insights.recommended} title="Prețul recomandat ACP" />
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric
                    label="Oferte în selecție"
                    value={formatNumber(aggregate.totalMatched)}
                    hint={
                      aggregate.sampleCapped
                        ? `Agregat pe un eșantion de ${formatNumber(aggregate.sampleSize)} oferte`
                        : `Agregat pe toate cele ${formatNumber(aggregate.sampleSize)} oferte`
                    }
                  />
                  <Metric
                    label="Mediană €/mp"
                    value={perSqm(aggregate.pricePerSqm.median)}
                    hint={`${formatNumber(aggregate.pricePerSqm.count)} oferte cu €/mp`}
                  />
                  <Metric label="Medie €/mp" value={perSqm(aggregate.pricePerSqm.average)} />
                  <Metric
                    label="Interval €/mp"
                    value={`${money(aggregate.pricePerSqm.min)} – ${money(aggregate.pricePerSqm.max)}`}
                    hint={`P25 ${money(aggregate.pricePerSqm.p25)} · P75 ${money(aggregate.pricePerSqm.p75)}`}
                  />
                  <Metric
                    label="Prospețime"
                    value={FRESHNESS_LABEL[aggregate.freshness.level]}
                    hint={
                      aggregate.freshness.lastSeenAt
                        ? `Ultima observare: ${formatDateTime(aggregate.freshness.lastSeenAt)}`
                        : "Fără date observate"
                    }
                  />
                  <Metric
                    label="Ultima sincronizare"
                    value={
                      aggregate.freshness.lastSyncAt
                        ? formatDateTime(aggregate.freshness.lastSyncAt)
                        : "—"
                    }
                    hint={
                      aggregate.freshness.ageDays !== null
                        ? `Vechime date: ${aggregate.freshness.ageDays} zile`
                        : undefined
                    }
                  />
                  <Metric
                    label="Calitatea datelor"
                    value={COVERAGE_LABEL[aggregate.coverage.level]}
                    hint={
                      aggregate.coverage.completeness !== null
                        ? `Completitudine ${aggregate.coverage.completeness.toFixed(0)}%`
                        : undefined
                    }
                  />
                  {insights ? (
                    <Metric
                      label="Comparabile ACP"
                      value={`${formatNumber(insights.comparables.used)} / ${formatNumber(insights.comparables.total)}`}
                      hint={`${formatNumber(insights.comparables.excluded)} excluse · ${formatNumber(insights.comparables.outliers)} outlieri`}
                    />
                  ) : (
                    <Metric
                      label="Surse în selecție"
                      value={formatNumber(aggregate.sourceMix.length)}
                      hint={aggregate.sourceMix
                        .slice(0, 2)
                        .map((s) => `${result.sourceNames[s.source] ?? s.source} ${s.share.toFixed(0)}%`)
                        .join(" · ")}
                    />
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-border p-4">
                  <table className="w-full min-w-[36rem] text-left">
                    <thead>
                      <tr className="text-xs text-muted-foreground uppercase">
                        <th className="pb-2 pr-3 font-medium">Indicator</th>
                        <th className="pb-2 pr-3 font-medium">Min</th>
                        <th className="pb-2 pr-3 font-medium">P25</th>
                        <th className="pb-2 pr-3 font-medium">Mediană</th>
                        <th className="pb-2 pr-3 font-medium">Medie</th>
                        <th className="pb-2 pr-3 font-medium">P75</th>
                        <th className="pb-2 font-medium">Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      <StatsRow label="Preț €/mp" stats={aggregate.pricePerSqm} unit="eur" />
                      <StatsRow label="Preț total" stats={aggregate.price} unit="eur" />
                      <StatsRow label="Suprafață" stats={aggregate.usableArea} unit="sqm" />
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <Distribution
                    title="Distribuție €/mp"
                    buckets={aggregate.pricePerSqmDistribution}
                    available={aggregate.distributionsAvailable}
                  />
                  <Distribution
                    title="Distribuție suprafață"
                    buckets={aggregate.areaDistribution}
                    available={aggregate.distributionsAvailable}
                  />
                  <Distribution
                    title="Distribuție camere"
                    buckets={aggregate.roomsDistribution}
                    available={aggregate.distributionsAvailable}
                  />
                </div>

                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Evoluție lunară</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground">
                          <Info className="size-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Calculată exclusiv din istoricul real al anunțurilor (snapshot-uri).
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="mt-3">
                    <TrendBlock trend={result.trend} />
                  </div>
                </div>
              </>
            )}

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <Gauge className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Surse și prospețime</h3>
              </div>
              <div className="mt-3">
                <SourceQualityTable sources={result.sources} names={result.sourceNames} />
              </div>
            </div>

            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              Calculat la {formatDateTime(result.computedAt)} din datele importate în Habitoo.
              <Activity className="ml-2 size-3.5" />
              Toate cifrele sunt deterministe, fără interpretare automată.
            </p>
          </>
        )}
      </div>
    </SectionCard>
  );
}
