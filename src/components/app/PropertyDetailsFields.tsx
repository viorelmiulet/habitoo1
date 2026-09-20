/**
 * Secțiunile de detalii ale anunțului (Detalii, Suprafețe, Clădire, Utilități,
 * Finisaje, Dotări), structurate ca la ImmoFlux: dropdown-uri, numerice, radio
 * și grupuri de checkbox. Valorile sunt text în română, fără coduri numerice.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  additionalSpaceOptions,
  applianceOptions,
  blindOptions,
  buildingAmenityOptions,
  buildingStructureOptions,
  buildingTypeOptions,
  comfortOptions,
  constructionStageOptions,
  coolingOptions,
  destinationOptions,
  entryDoorOptions,
  finishStateOptions,
  floorFinishOptions,
  floorLabelOptions,
  furnishingOptions,
  generalFeatureOptions,
  heatingOptions,
  insulationOptions,
  interiorDoorOptions,
  kitchenOptions,
  layoutOptions,
  meteringOptions,
  miscFeatureOptions,
  orientationOptions,
  parkingOptions,
  seismicRiskOptions,
  shutterOptions,
  streetArrangementOptions,
  utilityOptions,
  viewOptions,
  wallFinishOptions,
  windowOptions,
} from "@/lib/property-taxonomy";
import { propertyTypeLabels } from "@/lib/labels";
import { useMemo, useRef } from "react";

export type PropertyDetailsValue = Record<string, unknown>;

type Props = {
  idPrefix?: string;
  value: PropertyDetailsValue;
  onChange: (patch: PropertyDetailsValue) => void;
};

const NONE = "__none__";

/**
 * IMPORTANT: câmpurile sunt componente definite la nivel de modul, NU în corpul
 * `PropertyDetailsFields`. Definite în interior, React ar primi un tip nou de
 * componentă la fiecare randare, ar demonta și remonta toate câmpurile
 * (pierderea focusului la tastare și saltul poziției de derulare la bifare).
 */

type FieldCtx = {
  idPrefix: string;
  /** Citește valorile ca text / listă / boolean. */
  str: (key: string) => string;
  arr: (key: string) => string[];
  bool: (key: string) => boolean;
  setField: (key: string, v: unknown) => void;
  toggleInArray: (key: string, option: string, checked: boolean) => void;
};

function SelectField({
  ctx,
  field,
  label,
  options,
}: {
  ctx: FieldCtx;
  field: string;
  label: string;
  options: readonly string[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`${ctx.idPrefix}-${field}`}>{label}</Label>
      <Select
        value={ctx.str(field) || NONE}
        onValueChange={(v) => ctx.setField(field, v === NONE ? null : v)}
      >
        <SelectTrigger id={`${ctx.idPrefix}-${field}`}>
          <SelectValue placeholder="Selectează" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Nespecificat</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberField({
  ctx,
  field,
  label,
  min = 0,
}: {
  ctx: FieldCtx;
  field: string;
  label: string;
  /** Etajul poate fi negativ (demisol / subsol), restul câmpurilor nu. */
  min?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`${ctx.idPrefix}-${field}`}>{label}</Label>
      <Input
        id={`${ctx.idPrefix}-${field}`}
        type="number"
        inputMode="decimal"
        min={min}
        value={ctx.str(field)}
        onChange={(e) => ctx.setField(field, e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

function BoolField({
  ctx,
  field,
  label,
}: {
  ctx: FieldCtx;
  field: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Checkbox
        id={`${ctx.idPrefix}-${field}`}
        checked={ctx.bool(field)}
        onCheckedChange={(c) => ctx.setField(field, c === true)}
      />
      <Label htmlFor={`${ctx.idPrefix}-${field}`} className="cursor-pointer font-normal">
        {label}
      </Label>
    </div>
  );
}

function CheckGroup({
  ctx,
  field,
  label,
  options,
}: {
  ctx: FieldCtx;
  field: string;
  label: string;
  options: readonly string[];
}) {
  const selected = ctx.arr(field);
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid items-start gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {options.map((o) => (
          <div key={o} className="flex items-center gap-2 text-sm">
            <Checkbox
              id={`${ctx.idPrefix}-${field}-${o}`}
              checked={selected.includes(o)}
              onCheckedChange={(c) => ctx.toggleInArray(field, o, c === true)}
            />
            <Label
              htmlFor={`${ctx.idPrefix}-${field}-${o}`}
              className="min-w-0 cursor-pointer font-normal break-words"
            >
              {o}
            </Label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function RadioField({
  ctx,
  field,
  label,
  options,
}: {
  ctx: FieldCtx;
  field: string;
  label: string;
  options: readonly string[];
}) {
  const current = ctx.str(field);
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      <RadioGroup
        value={current}
        onValueChange={(v) => ctx.setField(field, v || null)}
        className="grid items-start gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {options.map((o) => (
          <div key={o} className="flex items-center gap-2 text-sm">
            <RadioGroupItem value={o} id={`${ctx.idPrefix}-${field}-${o}`} />
            <Label htmlFor={`${ctx.idPrefix}-${field}-${o}`} className="cursor-pointer font-normal">
              {o}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {current ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => ctx.setField(field, null)}
        >
          Șterge selecția
        </button>
      ) : null}
    </fieldset>
  );
}

export function PropertyDetailsFields({ idPrefix = "det", value, onChange }: Props) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // Contextul este stabil între randări: doar câmpurile atinse se re-randează.
  const ctx = useMemo<FieldCtx>(() => {
    const str = (key: string) =>
      valueRef.current[key] == null ? "" : String(valueRef.current[key]);
    const arr = (key: string) =>
      Array.isArray(valueRef.current[key]) ? (valueRef.current[key] as string[]) : [];
    return {
      idPrefix,
      str,
      arr,
      bool: (key: string) => valueRef.current[key] === true,
      setField: (key: string, v: unknown) => changeRef.current({ [key]: v }),
      toggleInArray: (key: string, option: string, checked: boolean) => {
        const current = arr(key);
        const next = checked
          ? [...new Set([...current, option])]
          : current.filter((x) => x !== option);
        changeRef.current({ [key]: next });
      },
    };
  }, [idPrefix]);

  const setField = ctx.setField;

  return (
    <Accordion type="multiple" className="w-full">
      <AccordionItem value="detalii">
        <AccordionTrigger className="text-sm font-medium">Detalii</AccordionTrigger>
        <AccordionContent className="space-y-6 pt-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-property_type`}>Tip apartament / imobil</Label>
              <Select
                value={ctx.str("property_type")}
                onValueChange={(v) => setField("property_type", v)}
              >
                <SelectTrigger id={`${idPrefix}-property_type`}>
                  <SelectValue placeholder="Selectează" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(propertyTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SelectField ctx={ctx} field="layout" label="Compartimentare" options={layoutOptions} />
            <SelectField ctx={ctx} field="comfort" label="Confort" options={comfortOptions} />
            <SelectField ctx={ctx} field="destination" label="Destinație" options={destinationOptions} />
            <NumberField ctx={ctx} field="rooms" label="Camere" />
            <NumberField ctx={ctx} field="bedrooms" label="Dormitoare" />
            <NumberField ctx={ctx} field="kitchens" label="Bucătării" />
            <NumberField ctx={ctx} field="bathrooms" label="Băi" />
            <NumberField ctx={ctx} field="balconies" label="Balcoane" />
            <NumberField ctx={ctx} field="terraces" label="Terase" />
            <SelectField ctx={ctx} field="floor_label" label="Etaj" options={floorLabelOptions} />
            <NumberField ctx={ctx} field="floor" label="Etaj (număr)" min={-5} />
            <SelectField ctx={ctx} field="orientation" label="Orientare" options={orientationOptions} />
            <NumberField ctx={ctx} field="build_year" label="An construcție" />
            <NumberField ctx={ctx} field="renovation_year" label="Anul renovării" />
            <NumberField ctx={ctx} field="parking_spaces" label="Parcări" />
            <NumberField ctx={ctx} field="garages" label="Garaje" />
            <SelectField ctx={ctx} field="parking" label="Tip parcare" options={parkingOptions} />
          </div>
          <div className="grid items-start gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <BoolField ctx={ctx} field="bathroom_window" label="Geam la baie" />
            <BoolField ctx={ctx} field="open_kitchen" label="Bucătărie deschisă" />
            <BoolField ctx={ctx} field="pet_friendly" label="Pet friendly" />
            <BoolField ctx={ctx} field="key_in_agency" label="Cheia în agenție" />
            <BoolField ctx={ctx} field="balcony" label="Balcon" />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="suprafete">
        <AccordionTrigger className="text-sm font-medium">Suprafețe</AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField ctx={ctx} field="surface" label="Suprafață utilă (m²)" />
            <NumberField ctx={ctx} field="usable_surface" label="Utilă (m²)" />
            <NumberField ctx={ctx} field="built_surface" label="Construită (m²)" />
            <NumberField ctx={ctx} field="total_usable_surface" label="Utilă totală (m²)" />
            <NumberField ctx={ctx} field="balcony_surface" label="Balcoane (m²)" />
            <NumberField ctx={ctx} field="terrace_surface" label="Terase (m²)" />
            <NumberField ctx={ctx} field="garden_surface" label="Suprafață grădină (m²)" />
            <NumberField ctx={ctx} field="land_surface" label="Teren (m²)" />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="cladire">
        <AccordionTrigger className="text-sm font-medium">Clădire</AccordionTrigger>
        <AccordionContent className="space-y-6 pt-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              ctx={ctx}
              field="construction_stage"
              label="Stadiu construcție"
              options={constructionStageOptions}
            />
            <SelectField ctx={ctx} field="building_type" label="Tip" options={buildingTypeOptions} />
            <SelectField
              ctx={ctx}
              field="building_structure"
              label="Structură"
              options={buildingStructureOptions}
            />
            <SelectField ctx={ctx} field="seismic_risk" label="Risc seismic" options={seismicRiskOptions} />
            <NumberField ctx={ctx} field="building_floors" label="Etaje" />
            <NumberField ctx={ctx} field="recessed_floors" label="Etaje retrase" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Înălțime</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <BoolField ctx={ctx} field="has_basement" label="S+ (subsol)" />
              <BoolField ctx={ctx} field="has_semi_basement" label="D+ (demisol)" />
              <BoolField ctx={ctx} field="has_ground_floor" label="P+ (parter)" />
              <BoolField ctx={ctx} field="has_attic" label="M (mansardă)" />
              <BoolField ctx={ctx} field="has_loft" label="Pod" />
            </div>
          </fieldset>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="utilitati">
        <AccordionTrigger className="text-sm font-medium">Utilități</AccordionTrigger>
        <AccordionContent className="space-y-6 pt-2">
          <CheckGroup ctx={ctx} field="utilities" label="Generale" options={utilityOptions} />
          <CheckGroup ctx={ctx} field="heating_systems" label="Sistem încălzire" options={heatingOptions} />
          <CheckGroup ctx={ctx} field="cooling_systems" label="Climatizare" options={coolingOptions} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="finisaje">
        <AccordionTrigger className="text-sm font-medium">Finisaje</AccordionTrigger>
        <AccordionContent className="space-y-6 pt-2">
          <RadioField ctx={ctx} field="finish_state" label="Stare" options={finishStateOptions} />
          <CheckGroup ctx={ctx} field="insulation" label="Izolații" options={insulationOptions} />
          <CheckGroup ctx={ctx} field="wall_finishes" label="Pereți" options={wallFinishOptions} />
          <CheckGroup ctx={ctx} field="floor_finishes" label="Podele" options={floorFinishOptions} />
          <CheckGroup ctx={ctx} field="windows" label="Ferestre" options={windowOptions} />
          <CheckGroup ctx={ctx} field="blinds" label="Jaluzele" options={blindOptions} />
          <CheckGroup ctx={ctx} field="shutters" label="Rulouri" options={shutterOptions} />
          <CheckGroup ctx={ctx} field="entry_door" label="Ușă intrare" options={entryDoorOptions} />
          <CheckGroup ctx={ctx} field="interior_doors" label="Uși interior" options={interiorDoorOptions} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="dotari">
        <AccordionTrigger className="text-sm font-medium">Dotări</AccordionTrigger>
        <AccordionContent className="space-y-6 pt-2">
          <RadioField ctx={ctx} field="furnishing" label="Mobilat" options={furnishingOptions} />
          <CheckGroup
              ctx={ctx}
            field="additional_spaces"
            label="Spații adiționale"
            options={additionalSpaceOptions}
          />
          <CheckGroup ctx={ctx} field="kitchen_features" label="Bucătărie" options={kitchenOptions} />
          <CheckGroup ctx={ctx} field="metering" label="Contorizare" options={meteringOptions} />
          <CheckGroup ctx={ctx} field="appliances" label="Electrocasnice" options={applianceOptions} />
          <CheckGroup ctx={ctx} field="building_amenities" label="Imobil" options={buildingAmenityOptions} />
          <CheckGroup
              ctx={ctx}
            field="street_arrangement"
            label="Amenajare străzi"
            options={streetArrangementOptions}
          />
          <CheckGroup ctx={ctx} field="views" label="Priveliște" options={viewOptions} />
          <CheckGroup ctx={ctx} field="misc_features" label="Diverse" options={miscFeatureOptions} />
          <CheckGroup
            ctx={ctx}
            field="features"
            label="Facilități"
            options={generalFeatureOptions}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
