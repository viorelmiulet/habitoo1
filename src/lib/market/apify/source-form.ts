/**
 * Formularul unei surse Apify: validare pură, fără rețea și fără React.
 *
 * Inputul actorului și maparea câmpurilor se scriu ca JSON. Un JSON invalid
 * nu se salvează niciodată: eroarea de parsare este raportată în clar, lângă
 * câmp. Inputul trebuie să respecte schema documentată a actorului, iar maparea
 * traduce numele câmpurilor lui în câmpurile Habitoo.
 */

/** Câmpurile în care se poate mapa un rezultat Apify, cu eticheta lor. */
export const APIFY_TARGET_FIELD_LABELS: { field: string; label: string }[] = [
  { field: "sourceListingId", label: "Identificator la sursă" },
  { field: "url", label: "Adresa anunțului" },
  { field: "title", label: "Titlu" },
  { field: "price", label: "Preț" },
  { field: "currency", label: "Monedă" },
  { field: "usableArea", label: "Suprafață utilă" },
  { field: "totalArea", label: "Suprafață construită" },
  { field: "rooms", label: "Camere" },
  { field: "city", label: "Localitate" },
  { field: "county", label: "Județ" },
  { field: "neighborhood", label: "Zonă / cartier" },
  { field: "propertyType", label: "Tip proprietate" },
  { field: "transactionType", label: "Tip tranzacție" },
  { field: "listingDate", label: "Data publicării" },
  { field: "sellerType", label: "Tip vânzător" },
  { field: "images", label: "Imagini" },
];

export type ApifySourceFormValues = {
  key: string;
  label: string;
  actorId: string;
  maxItems: string;
  targets: ("market_pool" | "prospects")[];
  prospectOrganizationId: string | null;
  unitCostUsd: string;
  notes: string;
  inputJson: string;
  fieldMappingJson: string;
};

export type ApifySourcePayload = {
  key: string;
  label: string;
  actorId: string;
  maxItems: number;
  targets: ("market_pool" | "prospects")[];
  prospectOrganizationId: string | null;
  unitCostUsd: number | null;
  notes: string | null;
  input: Record<string, unknown>;
  fieldMapping: Record<string, string | string[]>;
};

export type ApifyFormErrors = Partial<Record<keyof ApifySourceFormValues, string>>;

export function emptyApifySourceForm(): ApifySourceFormValues {
  return {
    key: "",
    label: "",
    actorId: "",
    maxItems: "100",
    targets: ["market_pool"],
    prospectOrganizationId: null,
    unitCostUsd: "",
    notes: "",
    inputJson: "{}",
    fieldMappingJson: "{}",
  };
}

/** Verifică un text JSON și explică eroarea exact cum o raportează parserul. */
export function parseJsonObject(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `JSON invalid: ${detail}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "JSON invalid: se așteaptă un obiect { }." };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

function mappingFromObject(
  value: Record<string, unknown>,
): { ok: true; value: Record<string, string | string[]> } | { ok: false; message: string } {
  const out: Record<string, string | string[]> = {};
  for (const [field, keys] of Object.entries(value)) {
    if (typeof keys === "string") {
      out[field] = keys;
      continue;
    }
    if (Array.isArray(keys) && keys.every((key) => typeof key === "string")) {
      out[field] = keys as string[];
      continue;
    }
    return {
      ok: false,
      message: `Maparea pentru „${field}” trebuie să fie un text sau o listă de texte.`,
    };
  }
  return { ok: true, value: out };
}

/** Validarea completă a formularului; nimic nu se trimite dacă există erori. */
export function validateApifySourceForm(
  values: ApifySourceFormValues,
): { ok: true; payload: ApifySourcePayload } | { ok: false; errors: ApifyFormErrors } {
  const errors: ApifyFormErrors = {};

  const key = values.key.trim();
  if (key === "") errors.key = "Cheia este obligatorie.";
  else if (!/^[a-z0-9_]+$/.test(key)) {
    errors.key = "Cheia poate conține doar litere mici, cifre și liniuță de subliniere.";
  }

  const label = values.label.trim();
  if (label === "") errors.label = "Denumirea este obligatorie.";

  const actorId = values.actorId.trim();
  if (actorId === "") errors.actorId = "Identificatorul actorului este obligatoriu.";

  const maxItems = Number(values.maxItems);
  if (!Number.isFinite(maxItems) || !Number.isInteger(maxItems) || maxItems < 1 || maxItems > 10000) {
    errors.maxItems = "Maximul de rezultate este un număr întreg între 1 și 10000.";
  }

  if (values.targets.length === 0) errors.targets = "Alege cel puțin o destinație.";
  if (values.targets.includes("prospects") && !values.prospectOrganizationId) {
    errors.prospectOrganizationId = "Alege agenția care primește prospecții.";
  }

  let unitCostUsd: number | null = null;
  if (values.unitCostUsd.trim() !== "") {
    const parsed = Number(values.unitCostUsd);
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.unitCostUsd = "Costul pe rezultat este un număr pozitiv.";
    } else {
      unitCostUsd = parsed;
    }
  }

  const input = parseJsonObject(values.inputJson);
  if (!input.ok) errors.inputJson = input.message;

  const mappingJson = parseJsonObject(values.fieldMappingJson);
  let fieldMapping: Record<string, string | string[]> = {};
  if (!mappingJson.ok) {
    errors.fieldMappingJson = mappingJson.message;
  } else {
    const mapping = mappingFromObject(mappingJson.value);
    if (!mapping.ok) errors.fieldMappingJson = mapping.message;
    else fieldMapping = mapping.value;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      key,
      label,
      actorId,
      maxItems,
      targets: values.targets,
      prospectOrganizationId: values.targets.includes("prospects")
        ? values.prospectOrganizationId
        : null,
      unitCostUsd,
      notes: values.notes.trim() === "" ? null : values.notes.trim(),
      input: input.ok ? input.value : {},
      fieldMapping,
    },
  };
}

/** Cheile primului rezultat brut, ca maparea să se scrie din ce a returnat actorul. */
export function firstItemKeys(firstItemJson: string | null): string[] {
  if (!firstItemJson) return [];
  const parsed = parseJsonObject(firstItemJson);
  if (!parsed.ok) return [];
  const keys: string[] = [];
  const walk = (value: Record<string, unknown>, prefix: string) => {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      keys.push(path);
      if (child !== null && typeof child === "object" && !Array.isArray(child) && prefix === "") {
        walk(child as Record<string, unknown>, path);
      }
    }
  };
  walk(parsed.value, "");
  return keys;
}
