import { useEffect, useState } from "react";
import { AirVent, Blinds, Blocks, Building2, Check, CircleCheck, DoorClosed, DoorOpen, Flame, Gauge, Grid2X2, Info, List, Mountain, PaintRoller, PanelsTopLeft, Plug, Refrigerator, Route, Search, Shield, Sofa, SquareStack, Utensils, Wallpaper, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import * as taxonomy from "@/lib/property-taxonomy";
import { cn } from "@/lib/utils";

type Value = Record<string, unknown>;
type FeatureGroup = { field: string; title: string; icon: LucideIcon; options: readonly string[]; single?: boolean };
type FeatureSection = { title: string; subtitle: string; icon: LucideIcon; groups: FeatureGroup[] };
const VIEW_KEY = "habitoo-property-feature-view";

// Presentation metadata only: stored keys and options come from the existing taxonomy.
export const propertyFeatureSections: FeatureSection[] = [
  { title: "Utilități", subtitle: "Racordurile și sursele de utilități disponibile.", icon: Plug, groups: [
    { field: "utilities", title: "Generale", icon: CircleCheck, options: taxonomy.utilityOptions },
    { field: "heating_systems", title: "Sistem încălzire", icon: Flame, options: taxonomy.heatingOptions },
    { field: "cooling_systems", title: "Climatizare", icon: AirVent, options: taxonomy.coolingOptions },
  ] },
  { title: "Finisaje", subtitle: "Starea și materialele finisajelor, la interior și exterior.", icon: PaintRoller, groups: [
    { field: "finish_state", title: "Stare", icon: Info, options: taxonomy.finishStateOptions, single: true },
    { field: "insulation", title: "Izolații", icon: Shield, options: taxonomy.insulationOptions },
    { field: "wall_finishes", title: "Pereți", icon: Wallpaper, options: taxonomy.wallFinishOptions },
    { field: "floor_finishes", title: "Podele", icon: Blocks, options: taxonomy.floorFinishOptions },
    { field: "windows", title: "Ferestre", icon: PanelsTopLeft, options: taxonomy.windowOptions },
    { field: "blinds", title: "Jaluzele", icon: Blinds, options: taxonomy.blindOptions },
    { field: "shutters", title: "Rulouri", icon: SquareStack, options: taxonomy.shutterOptions },
    { field: "entry_door", title: "Ușă intrare", icon: DoorClosed, options: taxonomy.entryDoorOptions },
    { field: "interior_doors", title: "Uși interior", icon: DoorOpen, options: taxonomy.interiorDoorOptions },
  ] },
  { title: "Dotări", subtitle: "Echiparea și facilitățile incluse în proprietate.", icon: SquareStack, groups: [
    { field: "furnishing", title: "Mobilat", icon: Sofa, options: taxonomy.furnishingOptions, single: true },
    { field: "additional_spaces", title: "Spații adiționale", icon: Blocks, options: taxonomy.additionalSpaceOptions },
    { field: "kitchen_features", title: "Bucătărie", icon: Utensils, options: taxonomy.kitchenOptions },
    { field: "metering", title: "Contorizare", icon: Gauge, options: taxonomy.meteringOptions },
    { field: "appliances", title: "Electrocasnice", icon: Refrigerator, options: taxonomy.applianceOptions },
    { field: "building_amenities", title: "Imobil", icon: Building2, options: taxonomy.buildingAmenityOptions },
    { field: "street_arrangement", title: "Amenajare străzi", icon: Route, options: taxonomy.streetArrangementOptions },
    { field: "views", title: "Priveliște", icon: Mountain, options: taxonomy.viewOptions },
    { field: "misc_features", title: "Diverse", icon: Grid2X2, options: taxonomy.miscFeatureOptions },
  ] },
];

export function normalizeFeatureSearch(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("ro").trim();
}

function selectedOptions(value: Value, group: FeatureGroup): string[] {
  const current = value[group.field];
  return group.single ? (typeof current === "string" && current ? [current] : [])
    : Array.isArray(current) ? current.filter((v): v is string => typeof v === "string") : [];
}

export function filterFeatureSections(query: string, value?: Value) {
  const search = normalizeFeatureSearch(query);
  return propertyFeatureSections.map((section) => ({ ...section, groups: section.groups.map((group) => ({
    ...group,
    options: (value ? selectedOptions(value, group) : group.options).filter((option) => normalizeFeatureSearch(option).includes(search)),
  })).filter((group) => group.options.length > 0) })).filter((section) => section.groups.length > 0);
}

function FeatureGroupFields({ group, value, onChange, idPrefix, inline }: {
  group: FeatureGroup; value: Value; onChange?: (patch: Value) => void; idPrefix: string; inline: boolean;
}) {
  const selected = selectedOptions(value, group);
  const Icon = group.icon;
  const headingId = `${idPrefix}-${group.field}-heading`;
  const optionsClass = inline ? "flex flex-wrap items-start gap-1" : "grid grid-cols-2 items-start gap-1";
  const optionClass = "flex min-h-11 min-w-0 items-center gap-2 rounded-control px-2 py-2 text-sm font-normal leading-5 break-words";
  return (
    <div data-feature-group={group.field} className={cn("min-w-0", inline ? "grid gap-3 border-b border-border py-4 sm:grid-cols-[180px_minmax(0,1fr)]" : "rounded-card border border-border bg-card p-3 sm:p-4")}>
      <div className={cn("flex min-w-0 items-center gap-2", inline ? "self-start pt-2" : "mb-3 border-b border-primary/25 pb-3")}>
        <span className="grid size-8 shrink-0 place-items-center rounded-control bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden="true" /></span>
        <h4 id={headingId} className="min-w-0 font-sans text-sm font-bold text-accent-foreground">{group.title}</h4>
      </div>
      <div className="min-w-0">
        {!onChange ? <ul aria-labelledby={headingId} className={optionsClass}>{group.options.map((option) => (
          <li key={option} className={cn(optionClass, "bg-accent text-accent-foreground")}><Check className="size-4 shrink-0" aria-hidden="true" /><span>{option}</span></li>
        ))}</ul> : group.single ? <>
          <RadioGroup aria-labelledby={headingId} value={selected[0] ?? ""} onValueChange={(option) => onChange({ [group.field]: option || null })} className={optionsClass}>
            {group.options.map((option) => <Label key={option} htmlFor={`${idPrefix}-${group.field}-${option}`} className={cn(optionClass, "cursor-pointer", selected.includes(option) ? "bg-accent text-accent-foreground" : "hover:bg-muted")}>
              <RadioGroupItem className="size-[22px] shrink-0 focus-visible:ring-2" id={`${idPrefix}-${group.field}-${option}`} value={option} /><span className="min-w-0">{option}</span>
            </Label>)}
          </RadioGroup>
          <div className="h-11"><Button type="button" variant="link" className={cn("h-11 px-2 text-xs font-normal underline", selected.length === 0 && "invisible")} onClick={() => onChange({ [group.field]: null })} aria-label={`Șterge selecția ${group.title}`}>Șterge selecția</Button></div>
        </> : <div role="group" aria-labelledby={headingId} className={optionsClass}>
          {group.options.map((option) => <Label key={option} htmlFor={`${idPrefix}-${group.field}-${option}`} className={cn(optionClass, "cursor-pointer", selected.includes(option) ? "bg-accent text-accent-foreground" : "hover:bg-muted")}>
            <Checkbox className="size-[22px] focus-visible:ring-2" id={`${idPrefix}-${group.field}-${option}`} checked={selected.includes(option)} onCheckedChange={(checked) => onChange({ [group.field]: checked === true ? [...new Set([...selected, option])] : selected.filter((item) => item !== option) })} /><span className="min-w-0">{option}</span>
          </Label>)}
        </div>}
      </div>
    </div>
  );
}

export function PropertyFeatureSections({ value, onChange, idPrefix = "features" }: { value: Value; onChange?: (patch: Value) => void; idPrefix?: string }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("cards");
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === "inline") setView("inline"); } catch { /* Browser storage may be disabled. */ }
  }, []);
  const sections = filterFeatureSections(query, onChange ? undefined : value);
  const inline = !!onChange && view === "inline";
  return <div className="property-feature-sections min-w-0 space-y-6 text-foreground">
    {onChange ? <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" /><Input type="search" aria-label="Caută o opțiune (utilitate, finisaj, dotare)" placeholder="Caută o opțiune (utilitate, finisaj, dotare)…" className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <ToggleGroup type="single" aria-label="Afișarea opțiunilor" value={view} className="shrink-0 justify-start rounded-control border border-border bg-muted p-1" onValueChange={(next) => { if (!next) return; setView(next); try { localStorage.setItem(VIEW_KEY, next); } catch { /* Session-only preference fallback. */ } }}>
        <ToggleGroupItem value="cards" className="h-9 gap-2 px-3 data-[state=on]:bg-surface data-[state=on]:text-accent-foreground"><Grid2X2 className="size-4" />Carduri</ToggleGroupItem>
        <ToggleGroupItem value="inline" className="h-9 gap-2 px-3 data-[state=on]:bg-surface data-[state=on]:text-accent-foreground"><List className="size-4" />În linie</ToggleGroupItem>
      </ToggleGroup>
    </div> : null}
    {sections.map((section) => { const Icon = section.icon; return <section key={section.title} aria-label={section.title} className="min-w-0 space-y-4 border-b border-border pb-6 last:border-b-0">
      <header className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent text-accent-foreground"><Icon className="size-5" aria-hidden="true" /></span><div className="min-w-0"><h3 className="font-sans text-base font-bold">{section.title}</h3><p className="mt-1 text-sm text-muted-foreground">{section.subtitle}</p></div></header>
      <div className={inline ? "min-w-0" : "grid min-w-0 grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3"}>
        {section.groups.map((group) => <FeatureGroupFields key={group.field} group={group} value={value} onChange={onChange} idPrefix={idPrefix} inline={inline} />)}
      </div>
    </section>; })}
    {onChange && sections.length === 0 ? <p role="status" className="py-6 text-center text-sm text-muted-foreground">Nicio opțiune găsită.</p> : null}
  </div>;
}