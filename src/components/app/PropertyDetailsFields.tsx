/**
 * Secțiunile de detalii ale anunțului (Detalii, Suprafețe, Clădire, Utilități,
 * Finisaje, Dotări), structurate ca la ImmoFlux: dropdown-uri, numerice, radio
 * și grupuri de checkbox. Valorile sunt text în română, fără coduri numerice.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PropertyFeatureSections } from "@/components/app/PropertyFeatureSections";
import { FormRow, FormSection } from "@/components/app/FormSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildingStructureOptions,
  buildingTypeOptions,
  comfortOptions,
  constructionStageOptions,
  destinationOptions,
  floorLabelOptions,
  layoutOptions,
  orientationOptions,
  parkingOptions,
  seismicRiskOptions,
} from "@/lib/property-taxonomy";
import { propertyTypeLabels } from "@/lib/labels";
import { floorNumberRequired, syncFloor } from "@/lib/property-floor";
import { useMemo, useRef } from "react";

export type PropertyDetailsValue = Record<string, unknown>;

type Props = {
  idPrefix?: string;
  value: PropertyDetailsValue;
  onChange: (patch: PropertyDetailsValue) => void;
};

const NONE = "__none__";
const CONTROL = "h-9 text-[15px]";

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
  setFields: (patch: PropertyDetailsValue) => void;
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
    <FormRow compact htmlFor={`${ctx.idPrefix}-${field}`} label={label}>
      <Select
        value={ctx.str(field) || NONE}
        onValueChange={(v) => ctx.setField(field, v === NONE ? null : v)}
      >
        <SelectTrigger id={`${ctx.idPrefix}-${field}`} className={CONTROL}>
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
    </FormRow>
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
    <FormRow compact htmlFor={`${ctx.idPrefix}-${field}`} label={label}>
      <Input
        id={`${ctx.idPrefix}-${field}`}
        className={CONTROL}
        type="number"
        inputMode="decimal"
        min={min}
        value={ctx.str(field)}
        onChange={(e) => ctx.setField(field, e.target.value === "" ? null : Number(e.target.value))}
      />
    </FormRow>
  );
}

/**
 * Etajul: doar lista de etichete. `floor` se calculează imediat cu `syncFloor`
 * (la fel ca triggerul); numărul se cere doar pentru etichetele fără număr fix.
 */
function FloorField({ ctx }: { ctx: FieldCtx }) {
  const label = ctx.str("floor_label");
  const needsNumber = floorNumberRequired(label || null);
  return (
    <>
    <FormRow compact htmlFor={`${ctx.idPrefix}-floor_label`} label="Etaj">
      <Select
        value={label || NONE}
        onValueChange={(v) => {
          const next = v === NONE ? null : v;
          const current = ctx.str("floor");
          const synced = syncFloor(next, current === "" ? null : Number(current));
          ctx.setFields({ floor_label: next, floor: next ? synced.floor : null });
        }}
      >
        <SelectTrigger id={`${ctx.idPrefix}-floor_label`} className={CONTROL}>
          <SelectValue placeholder="Selectează" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Nespecificat</SelectItem>
          {floorLabelOptions.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormRow>
      {needsNumber ? (
        <FormRow compact htmlFor={`${ctx.idPrefix}-floor`} label="Număr etaj">
          <Input
            id={`${ctx.idPrefix}-floor`}
            className={CONTROL}
            type="number"
            inputMode="numeric"
            min={-5}
            required
            value={ctx.str("floor")}
            onChange={(e) =>
              ctx.setField("floor", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </FormRow>
      ) : null}
    </>
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
      setFields: (patch: PropertyDetailsValue) => changeRef.current(patch),
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
    <div className="min-w-0 space-y-4">
      {/* Două coloane echilibrate: Detalii | Suprafețe + Clădire una sub alta. */}
      <div data-details-layout className="grid min-w-0 items-start gap-4 min-[1280px]:grid-cols-2">
      <div data-tour={idPrefix === "new" ? "new-details" : undefined} className="min-w-0">
      <FormSection title="Detalii">
        <div className="space-y-1">
          <FormRow compact htmlFor={`${idPrefix}-property_type`} label="Tip apartament / imobil">
            <Select value={ctx.str("property_type")} onValueChange={(v) => setField("property_type", v)}>
              <SelectTrigger id={`${idPrefix}-property_type`} className={CONTROL}>
                <SelectValue placeholder="Selectează" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(propertyTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
          <SelectField ctx={ctx} field="layout" label="Compartimentare" options={layoutOptions} />
          <SelectField ctx={ctx} field="comfort" label="Confort" options={comfortOptions} />
          <SelectField ctx={ctx} field="destination" label="Destinație" options={destinationOptions} />
          <NumberField ctx={ctx} field="rooms" label="Camere" />
          <NumberField ctx={ctx} field="bedrooms" label="Dormitoare" />
          <NumberField ctx={ctx} field="kitchens" label="Bucătării" />
          <NumberField ctx={ctx} field="bathrooms" label="Băi" />
          <NumberField ctx={ctx} field="balconies" label="Balcoane" />
          <NumberField ctx={ctx} field="terraces" label="Terase" />
          <FloorField ctx={ctx} />
          <SelectField ctx={ctx} field="orientation" label="Orientare" options={orientationOptions} />
          <NumberField ctx={ctx} field="build_year" label="An construcție" />
          <NumberField ctx={ctx} field="renovation_year" label="Anul renovării" />
          <NumberField ctx={ctx} field="parking_spaces" label="Parcări" />
          <NumberField ctx={ctx} field="garages" label="Garaje" />
          <SelectField ctx={ctx} field="parking" label="Tip parcare" options={parkingOptions} />
        </div>
        <div className="grid items-start gap-x-4 gap-y-2.5 border-t border-border pt-4 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
          <BoolField ctx={ctx} field="bathroom_window" label="Geam la baie" />
          <BoolField ctx={ctx} field="open_kitchen" label="Bucătărie deschisă" />
          <BoolField ctx={ctx} field="pet_friendly" label="Pet friendly" />
          <BoolField ctx={ctx} field="key_in_agency" label="Cheia în agenție" />
          <BoolField ctx={ctx} field="balcony" label="Balcon" />
        </div>
      </FormSection>
      </div>
      <div data-details-column="secondary" className="flex min-w-0 flex-col gap-4">
      <FormSection title="Suprafețe">
        <div className="space-y-1">
          <NumberField ctx={ctx} field="usable_surface" label="Suprafață utilă (m²)" />
          <NumberField ctx={ctx} field="built_surface" label="Construită (m²)" />
          <NumberField ctx={ctx} field="total_usable_surface" label="Utilă totală (m²)" />
          <NumberField ctx={ctx} field="balcony_surface" label="Balcoane (m²)" />
          <NumberField ctx={ctx} field="terrace_surface" label="Terase (m²)" />
          <NumberField ctx={ctx} field="garden_surface" label="Suprafață grădină (m²)" />
          <NumberField ctx={ctx} field="land_surface" label="Teren (m²)" />
        </div>
      </FormSection>
      <FormSection title="Clădire">
        <div className="space-y-1">
          <SelectField ctx={ctx} field="construction_stage" label="Stadiu construcție" options={constructionStageOptions} />
          <SelectField ctx={ctx} field="building_type" label="Tip" options={buildingTypeOptions} />
          <SelectField ctx={ctx} field="building_structure" label="Structură" options={buildingStructureOptions} />
          <SelectField ctx={ctx} field="seismic_risk" label="Risc seismic" options={seismicRiskOptions} />
          <NumberField ctx={ctx} field="building_floors" label="Etaje" />
          <NumberField ctx={ctx} field="recessed_floors" label="Etaje retrase" />
        </div>
        <fieldset className="space-y-2 border-t border-border pt-3">
          <legend className="text-sm font-medium">Înălțime</legend>
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(130px,1fr))]">
          <BoolField ctx={ctx} field="has_basement" label="S+ (subsol)" />
          <BoolField ctx={ctx} field="has_semi_basement" label="D+ (demisol)" />
          <BoolField ctx={ctx} field="has_ground_floor" label="P+ (parter)" />
          <BoolField ctx={ctx} field="has_attic" label="M (mansardă)" />
          <BoolField ctx={ctx} field="has_loft" label="Pod" />
          </div>
        </fieldset>
      </FormSection>
      </div>
      </div>
      <PropertyFeatureSections idPrefix={idPrefix} value={value} onChange={onChange} />
    </div>
  );
}
