/**
 * Panoul de filtre al listei de proprietăți: tab-uri tip dosar și patru
 * coloane compacte. Tab-ul se aplică imediat; restul doar la „Caută” / Enter.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PortalFilterSelect, type PortalFilterOption } from "@/components/app/PortalFilterSelect";
import { PromotionFilterSelect } from "@/components/app/PromotionFilterSelect";
import type { PromotionFilterGroup } from "@/lib/portals/promotion-filter";
import { propertyStatusLabels, propertyTypeLabels } from "@/lib/labels";
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPE_TABS,
  activePropertyTab,
  digitsOnly,
  formatPropertySourceLabel,
  formatThousands,
  propertyTabTypes,
  selectedStatuses,
  serializeStatuses,
  type PropertyListFilters,
} from "@/lib/property-list-filters";
import {
  cityOptions,
  countyOptions,
  geographyFromPlaces,
  otherFiltersCount,
  placesFromGeography,
  zoneOptions,
  type GeographySelection,
} from "@/lib/property-filter-query";
import type { SearchPlaceOption } from "@/lib/search-places";
import { cn } from "@/lib/utils";

export type PropertyFilterPanelProps = {
  applied: PropertyListFilters;
  placeValue: string;
  onApply: (filters: PropertyListFilters) => void;
  onTab: (tab: string) => void;
  onReset: () => void;
  placeOptions: SearchPlaceOption[];
  showAgent: boolean;
  agentOptions: { value: string; label: string; count: number }[];
  portalOptions: PortalFilterOption[];
  promotionGroups: PromotionFilterGroup[];
  sources: string[];
  destinations: string[];
  savedLinks?: ReactNode;
};

const fieldBase = "h-9 w-full rounded-[4px] border border-input bg-surface px-2 text-[15px] text-foreground shadow-none placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-primary";
const valued = "border-primary";
const triggerBase = cn(fieldBase, "relative justify-center pr-7 text-center font-normal [&>svg]:absolute [&>svg]:right-2 [&>svg]:size-3.5 [&>svg]:opacity-80 [&>span]:text-center");

function Row({ label, htmlFor, children, advanced, expanded }: { label: string; htmlFor?: string; children: ReactNode; advanced?: boolean; expanded?: boolean }) {
  return (
    <div data-filter-row={label} className={cn("grid grid-cols-1 gap-1 md:grid-cols-[minmax(84px,140px)_minmax(0,220px)] md:items-center md:gap-3", advanced && !expanded && "hidden md:grid")}>
      <label htmlFor={htmlFor} className="text-[15px] font-normal text-foreground/80 md:text-right">{label}</label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Range({ idPrefix, label, min, max, onMin, onMax, type = "text", format }: { idPrefix: string; label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void; type?: "text" | "date"; format?: (v: string) => string }) {
  const show = format ?? ((v: string) => v);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
      <input id={idPrefix} aria-label={`${label} de la`} type={type} inputMode={type === "text" ? "numeric" : undefined} value={show(min)} onChange={(e) => onMin(e.target.value)} className={cn(fieldBase, "px-1.5", min && valued)} />
      <span className="text-foreground/70">-</span>
      <input aria-label={`${label} până la`} type={type} inputMode={type === "text" ? "numeric" : undefined} value={show(max)} onChange={(e) => onMax(e.target.value)} className={cn(fieldBase, "px-1.5", max && valued)} />
    </div>
  );
}

function SimpleSelect({ id, value, onChange, options, active }: { id: string; value: string; onChange: (v: string) => void; options: [string, string][]; active: boolean }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={cn(triggerBase, active && valued)}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function MultiSelect({ id, label, empty, options, value, onChange }: { id: string; label: string; empty: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const text = value.length === 0 ? empty : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? "1 selectată" : `${value.length} selectate`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" id={id} aria-label={label} className={cn(fieldBase, "relative flex items-center justify-center pr-7", value.length > 0 && valued)}>
          <span className="truncate">{text}</span>
          <ChevronDown aria-hidden className="absolute right-2 size-3.5 opacity-80" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1">
        {options.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">Nicio opțiune</p> : options.map((o) => {
          const checked = value.includes(o.value);
          return (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
              <Checkbox checked={checked} onCheckedChange={() => onChange(checked ? value.filter((v) => v !== o.value) : [...value, o.value])} />
              <span className="truncate">{o.label}</span>
            </label>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export function PropertyFilterPanel(props: PropertyFilterPanelProps) {
  const { applied, placeValue, onApply, onTab, onReset, placeOptions, showAgent } = props;
  const appliedKey = JSON.stringify([applied, placeValue]);
  const [draft, setDraft] = useState<PropertyListFilters>({ ...applied, locuri: placeValue });
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setDraft({ ...applied, locuri: placeValue }); }, [appliedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof PropertyListFilters>(key: K, value: PropertyListFilters[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const geo = useMemo(() => geographyFromPlaces(draft.locuri), [draft.locuri]);
  const setGeo = (next: GeographySelection) => setDraft((d) => ({ ...d, locuri: placesFromGeography(next), city: "all", district: "all" }));
  const tab = activePropertyTab(applied);
  const typeChoices = propertyTabTypes(tab);
  const statuses = selectedStatuses(draft);
  const otherCount = otherFiltersCount(draft, showAgent);
  const counties = countyOptions(placeOptions);
  const cities = cityOptions(placeOptions, geo.county).map((o) => ({ value: o.value, label: o.label }));
  const zones = zoneOptions(placeOptions, geo.county, geo.cities).map((o) => ({ value: o.value, label: o.label }));

  const submit = (e: React.FormEvent) => { e.preventDefault(); onApply(draft); };

  return (
    <div>
      <div role="tablist" aria-label="Categorie proprietate" className="flex overflow-x-auto">
        {PROPERTY_TYPE_TABS.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => onTab(t.value)}
            className={cn("relative h-10 shrink-0 rounded-t-[4px] border border-transparent px-4 text-base", tab === t.value ? "z-10 -mb-px border-border border-b-surface bg-surface text-foreground" : "text-primary hover:underline")}>
            {t.label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} data-tour="properties-filters" className="rounded-[4px] rounded-tl-none border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2 xl:grid-cols-4">
          <div data-filter-column="1" className="space-y-2">
            <Row label="Județ" htmlFor="pf-county">
              <SimpleSelect id="pf-county" value={geo.county || "all"} active={Boolean(geo.county)} onChange={(v) => setGeo({ county: v === "all" ? "" : v, cities: [], zones: [] })} options={[["all", "Toată Țara"], ...counties.map((c) => [c.value, c.label] as [string, string])]} />
            </Row>
            <Row label="Localități" htmlFor="pf-cities" advanced expanded={expanded}>
              <MultiSelect id="pf-cities" label="Localități" empty="Toată Țara" options={cities} value={geo.cities} onChange={(v) => setGeo({ ...geo, cities: v, zones: [] })} />
            </Row>
            <Row label="Zonă" htmlFor="pf-zones" advanced expanded={expanded}>
              <MultiSelect id="pf-zones" label="Zonă" empty="Niciuna selectată" options={zones} value={geo.zones} onChange={(v) => setGeo({ ...geo, zones: v })} />
            </Row>
            <Row label="Stradă" htmlFor="pf-street" advanced expanded={expanded}>
              <input id="pf-street" value={draft.street} onChange={(e) => set("street", e.target.value)} placeholder="Caută stradă după nume" className={cn(fieldBase, draft.street && valued)} />
            </Row>
          </div>
          <div data-filter-column="2" className="mt-2 space-y-2 md:mt-0">
            <Row label="Tip proprietate" htmlFor="pf-type">
              <SimpleSelect id="pf-type" value={draft.type} active={draft.type !== "all"} onChange={(v) => set("type", v)} options={[["all", "Toate"], ...typeChoices.map((t) => [t, propertyTypeLabels[t] ?? t] as [string, string])]} />
            </Row>
            <Row label="Tip tranzacție" htmlFor="pf-transaction">
              <SimpleSelect id="pf-transaction" value={draft.transaction} active={draft.transaction !== "all"} onChange={(v) => set("transaction", v)} options={[["all", "Toate"], ["sale", "Vânzare"], ["rent", "Închiriere"]]} />
            </Row>
            <Row label="Camere" htmlFor="pf-rooms" advanced expanded={expanded}>
              <SimpleSelect id="pf-rooms" value={draft.rooms || "any"} active={Boolean(draft.rooms)} onChange={(v) => set("rooms", v === "any" ? "" : v)} options={[["any", "Toate"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5+", "5+"]]} />
            </Row>
            <Row label="Suprafață utilă" htmlFor="pf-surface" advanced expanded={expanded}>
              <Range idPrefix="pf-surface" label="Suprafață utilă" min={draft.surfaceMin} max={draft.surfaceMax} format={formatThousands} onMin={(v) => set("surfaceMin", digitsOnly(v))} onMax={(v) => set("surfaceMax", digitsOnly(v))} />
            </Row>
            <Row label="Preț" htmlFor="pf-price" advanced expanded={expanded}>
              <Range idPrefix="pf-price" label="Preț" min={draft.priceMin} max={draft.priceMax} format={formatThousands} onMin={(v) => set("priceMin", digitsOnly(v))} onMax={(v) => set("priceMax", digitsOnly(v))} />
            </Row>
          </div>
          <div data-filter-column="3" className="mt-2 space-y-2 xl:mt-0">
            <Row label="Valabilitate" htmlFor="pf-statuses" advanced expanded={expanded}>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" id="pf-statuses" className={cn(fieldBase, "relative flex items-center justify-center pr-7", draft.statuses && valued)}>
                    <span>{statuses.length} selectate</span>
                    <ChevronDown aria-hidden className="absolute right-2 size-3.5 opacity-80" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-1">
                  {PROPERTY_STATUSES.map((s) => {
                    const checked = statuses.includes(s);
                    return (
                      <label key={s} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                        <Checkbox checked={checked} disabled={checked && statuses.length === 1} onCheckedChange={() => set("statuses", serializeStatuses(checked ? statuses.filter((x) => x !== s) : [...statuses, s]))} />
                        {propertyStatusLabels[s]}
                      </label>
                    );
                  })}
                </PopoverContent>
              </Popover>
            </Row>
            <Row label="Adăugat între" htmlFor="pf-added" advanced expanded={expanded}>
              <Range idPrefix="pf-added" label="Adăugat" type="date" min={draft.addedAfter} max={draft.addedBefore} onMin={(v) => set("addedAfter", v)} onMax={(v) => set("addedBefore", v)} />
            </Row>
            <Row label="Modificat între" htmlFor="pf-updated" advanced expanded={expanded}>
              <Range idPrefix="pf-updated" label="Modificat" type="date" min={draft.updatedAfter} max={draft.updatedBefore} onMin={(v) => set("updatedAfter", v)} onMax={(v) => set("updatedBefore", v)} />
            </Row>
          </div>
          <div data-filter-column="4" className="mt-2 space-y-2 xl:mt-0">
            <Row label="Cuvinte cheie" htmlFor="pf-keywords">
              <input id="pf-keywords" value={draft.q} onChange={(e) => set("q", e.target.value)} placeholder="Titlu, HB-…, adresă" className={cn(fieldBase, draft.q && valued)} />
            </Row>
            <Row label="Destinație" htmlFor="pf-destination" advanced expanded={expanded}>
              <SimpleSelect id="pf-destination" value={draft.destination} active={draft.destination !== "all"} onChange={(v) => set("destination", v)} options={[["all", "Toate"], ...props.destinations.map((d) => [d, d] as [string, string])]} />
            </Row>
            <Row label="Promovare" htmlFor="pf-promotion" advanced expanded={expanded}>
              <PromotionFilterSelect id="pf-promotion" value={draft.promotion} groups={props.promotionGroups} onChange={(v) => set("promotion", v)} className={cn(triggerBase, "[&>svg]:size-3.5", draft.promotion && valued)} />
            </Row>
            <Row label="Alte filtre" htmlFor="pf-other" advanced expanded={expanded}>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" id="pf-other" className={cn(fieldBase, "relative flex items-center justify-center pr-7", otherCount > 0 && valued)}>
                    <span>{otherCount > 0 ? `Opțiuni (${otherCount})` : "Opțiuni"}</span>
                    <ChevronDown aria-hidden className="absolute right-2 size-3.5 opacity-80" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 space-y-3 p-3">
                  {showAgent ? (
                    <div className="space-y-1"><label htmlFor="pf-agent" className="text-sm">Agent</label>
                      <SimpleSelect id="pf-agent" value={draft.agent} active={draft.agent !== "all"} onChange={(v) => set("agent", v)} options={[["all", "Toți agenții"], ...props.agentOptions.map((o) => [o.value, `${o.label} (${o.count})`] as [string, string])]} /></div>
                  ) : null}
                  {props.portalOptions.length > 0 ? (
                    <div className="space-y-1"><label htmlFor="pf-portal" className="text-sm">Publicare pe portaluri</label>
                      <PortalFilterSelect id="pf-portal" value={draft.portal} options={props.portalOptions} onChange={(v) => set("portal", v)} onReset={() => set("portal", "all")} className={cn(triggerBase, draft.portal !== "all" && valued)} /></div>
                  ) : null}
                  <div className="space-y-1"><label htmlFor="pf-bathrooms" className="text-sm">Băi</label>
                    <SimpleSelect id="pf-bathrooms" value={draft.bathrooms || "any"} active={Boolean(draft.bathrooms)} onChange={(v) => set("bathrooms", v === "any" ? "" : v)} options={[["any", "Toate"], ["1", "1"], ["2", "2"], ["3+", "3+"]]} /></div>
                  <div className="space-y-1"><label htmlFor="pf-floor" className="text-sm">Etaj</label>
                    <Range idPrefix="pf-floor" label="Etaj" min={draft.floorMin} max={draft.floorMax} onMin={(v) => set("floorMin", digitsOnly(v))} onMax={(v) => set("floorMax", digitsOnly(v))} /></div>
                  {props.sources.length >= 2 ? (
                    <div className="space-y-1"><label htmlFor="pf-source" className="text-sm">Sursă</label>
                      <SimpleSelect id="pf-source" value={draft.source} active={draft.source !== "all"} onChange={(v) => set("source", v)} options={[["all", "Toate sursele"], ...props.sources.map((s) => [s, formatPropertySourceLabel(s)] as [string, string])]} /></div>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.mine} onCheckedChange={(c) => set("mine", c === true)} /> Doar ale mele</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.favoritesOnly} onCheckedChange={(c) => set("favoritesOnly", c === true)} /> Doar favorite</label>
                </PopoverContent>
              </Popover>
            </Row>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 items-center gap-3 md:flex md:justify-end xl:grid xl:grid-cols-4 xl:gap-x-4">
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 md:justify-end xl:col-span-3">
            <button type="button" data-tour="properties-filters-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="inline-flex items-center gap-1 text-[15px] text-primary md:hidden">
              {expanded ? "Mai puține filtre" : "Mai multe filtre"}{expanded ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
            </button>
            {props.savedLinks}
            <button type="button" onClick={onReset} className="text-[15px] text-primary hover:underline">Resetează toate filtrele</button>
          </div>
          <div className="grid grid-cols-1 md:w-[220px] xl:w-auto xl:grid-cols-[minmax(84px,140px)_minmax(0,220px)] xl:gap-3">
            <span aria-hidden className="hidden xl:block" />
            <button type="submit" className="h-[38px] w-full rounded-[4px] bg-primary text-[15px] font-medium text-primary-foreground hover:bg-primary/90">Caută</button>
          </div>
        </div>
      </form>
    </div>
  );
}
