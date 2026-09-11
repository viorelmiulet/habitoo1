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

export type PropertyDetailsValue = Record<string, unknown>;

type Props = {
  idPrefix?: string;
  value: PropertyDetailsValue;
  onChange: (patch: PropertyDetailsValue) => void;
};

const NONE = "__none__";

export function PropertyDetailsFields({ idPrefix = "det", value, onChange }: Props) {
  const str = (key: string) => (value[key] == null ? "" : String(value[key]));
  const arr = (key: string) => (Array.isArray(value[key]) ? (value[key] as string[]) : []);
  const bool = (key: string) => value[key] === true;

  const setField = (key: string, v: unknown) => onChange({ [key]: v });

  const toggleInArray = (key: string, option: string, checked: boolean) => {
    const current = arr(key);
    const next = checked ? [...new Set([...current, option])] : current.filter((x) => x !== option);
    onChange({ [key]: next });
  };

  const SelectField = ({
    field,
    label,
    options,
  }: {
    field: string;
    label: string;
    options: readonly string[];
  }) => (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-${field}`}>{label}</Label>
      <Select
        value={str(field) || NONE}
        onValueChange={(v) => setField(field, v === NONE ? null : v)}
      >
        <SelectTrigger id={`${idPrefix}-${field}`}>
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

  const NumberField = ({ field, label }: { field: string; label: string }) => (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-${field}`}>{label}</Label>
      <Input
        id={`${idPrefix}-${field}`}
        type="number"
        inputMode="decimal"
        min={0}
        value={str(field)}
        onChange={(e) => setField(field, e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );

  const BoolField = ({ field, label }: { field: string; label: string }) => (
    <div className="flex items-center gap-2 text-sm">
      <Checkbox
        id={`${idPrefix}-${field}`}
        checked={bool(field)}
        onCheckedChange={(c) => setField(field, c === true)}
      />
      <Label htmlFor={`${idPrefix}-${field}`} className="cursor-pointer font-normal">
        {label}
      </Label>
    </div>
  );

  const CheckGroup = ({
    field,
    label,
    options,
  }: {
    field: string;
    label: string;
    options: readonly string[];
  }) => (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid items-start gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {options.map((o) => (
          <div key={o} className="flex items-center gap-2 text-sm">
            <Checkbox
              id={`${idPrefix}-${field}-${o}`}
              checked={arr(field).includes(o)}
              onCheckedChange={(c) => toggleInArray(field, o, c === true)}
            />
            <Label
              htmlFor={`${idPrefix}-${field}-${o}`}
              className="min-w-0 cursor-pointer font-normal break-words"
            >
              {o}
            </Label>
          </div>
        ))}
      </div>
    </fieldset>
  );

  const RadioField = ({
    field,
    label,
    options,
  }: {
    field: string;
    label: string;
    options: readonly string[];
  }) => (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      <RadioGroup
        value={str(field)}
        onValueChange={(v) => setField(field, v || null)}
        className="grid items-start gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {options.map((o) => (
          <div key={o} className="flex items-center gap-2 text-sm">
            <RadioGroupItem value={o} id={`${idPrefix}-${field}-${o}`} />
            <Label htmlFor={`${idPrefix}-${field}-${o}`} className="cursor-pointer font-normal">
              {o}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {str(field) ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setField(field, null)}
        >
          Șterge selecția
        </button>
      ) : null}
    </fieldset>
  );

  return (
    <Accordion type="multiple" className="w-full">
      <AccordionItem value="detalii">
        <AccordionTrigger className="text-sm font-medium">Detalii</AccordionTrigger>
        <AccordionContent className="space-y-6 pt-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-property_type`}>Tip apartament / imobil</Label>
              <Select
                value={str("property_type")}
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
            <SelectField field="layout" label="Compartimentare" options={layoutOptions} />
            <SelectField field="comfort" label="Confort" options={comfortOptions} />
            <SelectField field="destination" label="Destinație" options={destinationOptions} />
            <NumberField field="rooms" label="Camere" />
            <NumberField field="bedrooms" label="Dormitoare" />
            <NumberField field="kitchens" label="Bucătării" />
            <NumberField field="bathrooms" label="Băi" />
            <NumberField field="balconies" label="Balcoane" />
            <NumberField field="terraces" label="Terase" />
            <SelectField field="floor_label" label="Etaj" options={floorLabelOptions} />
            <SelectField field="orientation" label="Orientare" options={orientationOptions} />
            <NumberField field="build_year" label="An construcție" />
            <NumberField field="renovation_year" label="Anul renovării" />
            <NumberField field="parking_spaces" label="Parcări" />
            <NumberField field="garages" label="Garaje" />
            <SelectField field="parking" label="Tip parcare" options={parkingOptions} />
          </div>
          <div className="grid items-start gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <BoolField field="bathroom_window" label="Geam la baie" />
            <BoolField field="open_kitchen" label="Bucătărie deschisă" />
            <BoolField field="pet_friendly" label="Pet friendly" />
            <BoolField field="key_in_agency" label="Cheia în agenție" />
            <BoolField field="balcony" label="Balcon" />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="suprafete">
        <AccordionTrigger className="text-sm font-medium">Suprafețe</AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField field="usable_surface" label="Utilă (m²)" />
            <NumberField field="built_surface" label="Construită (m²)" />
            <NumberField field="total_usable_surface" label="Utilă totală (m²)" />
            <NumberField field="balcony_surface" label="Balcoane (m²)" />
            <NumberField field="terrace_surface" label="Terase (m²)" />
            <NumberField field="garden_surface" label="Suprafață grădină (m²)" />
            <NumberField field="land_surface" label="Teren (m²)" />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="cladire">
        <AccordionTrigger className="text-sm font-medium">Clădire</AccordionTrigger>
        <AccordionContent className="space-y-6 pt-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              field="construction_stage"
              label="Stadiu construcție"
              options={constructionStageOptions}
            />
            <SelectField field="building_type" label="Tip" options={buildingTypeOptions} />
            <SelectField
              field="building_structure"
              label="Structură"
              options={buildingStructureOptions}
            />
            <SelectField field="seismic_risk" label="Risc seismic" options={seismicRiskOptions} />
            <NumberField field="building_floors" label="Etaje" />
            <NumberField field="recessed_floors" label="Etaje retrase" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Înălțime</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <BoolField field="has_basement" label="S+ (subsol)" />
              <BoolField field="has_semi_basement" label="D+ (demisol)" />
              <BoolField field="has_ground_floor" label="P+ (parter)" />
              <BoolField field="has_attic" label="M (mansardă)" />
              <BoolField field="has_loft" label="Pod" />
            </div>
          </fieldset>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="utilitati">
        <AccordionTrigger className="text-sm font-medium">Utilități</AccordionTrigger>
        <AccordionContent className="space-y-6 pt-2">
          <CheckGroup field="utilities" label="Generale" options={utilityOptions} />
          <CheckGroup field="heating_systems" label="Sistem încălzire" options={heatingOptions} />
          <CheckGroup field="cooling_systems" label="Climatizare" options={coolingOptions} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="finisaje">
        <AccordionTrigger className="text-sm font-medium">Finisaje</AccordionTrigger>
        <AccordionContent className="space-y-6 pt-2">
          <RadioField field="finish_state" label="Stare" options={finishStateOptions} />
          <CheckGroup field="insulation" label="Izolații" options={insulationOptions} />
          <CheckGroup field="wall_finishes" label="Pereți" options={wallFinishOptions} />
          <CheckGroup field="floor_finishes" label="Podele" options={floorFinishOptions} />
          <CheckGroup field="windows" label="Ferestre" options={windowOptions} />
          <CheckGroup field="blinds" label="Jaluzele" options={blindOptions} />
          <CheckGroup field="shutters" label="Rulouri" options={shutterOptions} />
          <CheckGroup field="entry_door" label="Ușă intrare" options={entryDoorOptions} />
          <CheckGroup field="interior_doors" label="Uși interior" options={interiorDoorOptions} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="dotari">
        <AccordionTrigger className="text-sm font-medium">Dotări</AccordionTrigger>
        <AccordionContent className="space-y-6 pt-2">
          <RadioField field="furnishing" label="Mobilat" options={furnishingOptions} />
          <CheckGroup
            field="additional_spaces"
            label="Spații adiționale"
            options={additionalSpaceOptions}
          />
          <CheckGroup field="kitchen_features" label="Bucătărie" options={kitchenOptions} />
          <CheckGroup field="metering" label="Contorizare" options={meteringOptions} />
          <CheckGroup field="appliances" label="Electrocasnice" options={applianceOptions} />
          <CheckGroup field="building_amenities" label="Imobil" options={buildingAmenityOptions} />
          <CheckGroup
            field="street_arrangement"
            label="Amenajare străzi"
            options={streetArrangementOptions}
          />
          <CheckGroup field="views" label="Priveliște" options={viewOptions} />
          <CheckGroup field="misc_features" label="Diverse" options={miscFeatureOptions} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
