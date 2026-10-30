import { useEffect } from "react";
import { AirVent, Blinds, Blocks, Building2, Check, CircleCheck, DoorClosed, DoorOpen, Flame, Gauge, Grid2X2, Info, Mountain, PaintRoller, PanelsTopLeft, Plug, Refrigerator, Route, Shield, Sofa, SquareStack, Utensils, Wallpaper, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import * as taxonomy from "@/lib/property-taxonomy";
import { FormSection } from "@/components/app/FormSection";
import { cn } from "@/lib/utils";

type Value = Record<string, unknown>;
type FeatureGroup = { field: string; title: string; icon: LucideIcon; options: readonly string[]; single?: boolean };
type FeatureSection = { title: string; subtitle: string; icon: LucideIcon; groups: FeatureGroup[] };
/** Fosta preferință Carduri/În linie; se șterge din browser, afișarea e doar Carduri. */
const LEGACY_VIEW_KEY = "habitoo-property-feature-view";

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

function selectedOptions(value: Value, group: FeatureGroup): string[] {
  const current = value[group.field];
  return group.single ? (typeof current === "string" && current ? [current] : [])
    : Array.isArray(current) ? current.filter((v): v is string => typeof v === "string") : [];
}

/** Fără valoare: toate opțiunile (editare). Cu valoare: doar opțiunile salvate (citire). */
export function filterFeatureSections(value?: Value) {
  return propertyFeatureSections.map((section) => ({ ...section, groups: section.groups.map((group) => ({
    ...group,
    options: value ? selectedOptions(value, group) : [...group.options],
  })).filter((group) => group.options.length > 0) })).filter((section) => section.groups.length > 0);
}

function FeatureGroupFields({ group, value, onChange, idPrefix }: {
  group: FeatureGroup; value: Value; onChange?: (patch: Value) => void; idPrefix: string;
}) {
  const selected = selectedOptions(value, group);
  const Icon = group.icon;
  const headingId = `${idPrefix}-${group.field}-heading`;
  const optionsClass = "grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] items-start gap-1";
  const optionClass = "flex min-h-9 min-w-0 items-center gap-2 rounded-control px-2 py-1.5 text-sm font-normal leading-5 [overflow-wrap:normal] [word-break:normal] hyphens-none";
  return (
    <div data-feature-group={group.field} className="h-full min-w-0 rounded-card border border-border bg-card p-3">
      <div className="mb-3 flex min-w-0 items-center gap-2 border-b border-primary/25 pb-3">
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
  useEffect(() => {
    try { localStorage.removeItem(LEGACY_VIEW_KEY); } catch { /* Browser storage may be disabled. */ }
  }, []);
  const sections = filterFeatureSections(onChange ? undefined : value);
  return <div className="property-feature-sections min-w-0 space-y-4 bg-background text-foreground">
    {sections.map((section) => <FormSection key={section.title} title={section.title}>
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
        {section.groups.map((group) => <FeatureGroupFields key={group.field} group={group} value={value} onChange={onChange} idPrefix={idPrefix} />)}
      </div>
    </FormSection>)}
  </div>;
}