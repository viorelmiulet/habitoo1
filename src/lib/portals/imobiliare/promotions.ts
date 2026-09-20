/**
 * Registrul serviciilor de promovare Imobiliare.ro (API v3) — funcții PURE.
 *
 * Un singur loc definește, pentru fiecare serviciu:
 *   - `slotType`  → `GET /api/v3/promotions/slots/{slot_type}` și
 *                   `GET /api/v3/promotions/listings/{slot_type}`;
 *   - `writeField`→ cheia din `promotions` trimisă la
 *                   `POST /api/v3/listings/{CUSTOM_REFERENCE}/promotions`.
 *
 * Reguli respectate:
 *   - `starter` și `rotatii` există în Swagger ca slot types, dar schema ofertei
 *     NU confirmă un câmp de scriere → rămân DOAR inventar (`writeField: null`).
 *     Nu inventăm câmpuri de scriere.
 *   - `promote_imoradar` are câmp de scriere confirmat, dar NU are slot type →
 *     se administrează fără contor (`slotType: null`).
 *   - `similar` → `similar_properties` și `month` → `properties_of_the_month`
 *     sunt marcate `configurable`: sunt expuse de Swagger/PDF, dar nu au fost
 *     confirmate printr-o scriere reală.
 *   - `video_viewing` („Vizionare prin apel video”) NU este promovare: este
 *     caracteristică a ofertei (`data_properties`) și nu apare aici.
 */

export type ImobiliarePromotionKind = "boolean" | "numeric";

/** Sursa mapării: confirmată în documentație/probă reală vs. configurabilă. */
export type ImobiliarePromotionSource = "confirmed" | "configurable";

export type ImobiliarePromotionDefinition = {
  /** Identificator intern stabil, folosit în UI și în jurnal. */
  id: string;
  label: string;
  /** `null` = serviciul nu are contor de sloturi la portal. */
  slotType: string | null;
  /** `null` = doar inventar; scrierea nu este confirmată de schema ofertei. */
  writeField: string | null;
  kind: ImobiliarePromotionKind;
  source: ImobiliarePromotionSource;
  /** Explicație scurtă pentru utilizator, când serviciul nu poate fi comandat. */
  note?: string;
};

export const IMOBILIARE_PROMOTIONS: ImobiliarePromotionDefinition[] = [
  {
    id: "promo",
    label: "Promovat",
    slotType: "promo",
    writeField: "promo",
    kind: "boolean",
    source: "confirmed",
  },
  {
    id: "tl",
    label: "Top Listing",
    slotType: "tl",
    writeField: "top_listing",
    kind: "boolean",
    source: "confirmed",
  },
  {
    id: "tls",
    label: "Top Listing S",
    slotType: "tls",
    writeField: "top_listing_s",
    kind: "boolean",
    source: "confirmed",
  },
  {
    id: "energy",
    label: "Puncte Energy",
    slotType: "energy",
    writeField: "energy",
    kind: "numeric",
    source: "confirmed",
  },
  {
    id: "bonus",
    label: "Bonus",
    slotType: "bonus",
    writeField: "bonus",
    kind: "boolean",
    source: "confirmed",
  },
  {
    id: "pole_position",
    label: "Pole Position",
    slotType: "pole_position",
    writeField: "pole_position",
    kind: "boolean",
    source: "confirmed",
  },
  {
    id: "promote_imoradar",
    label: "imoradar24",
    slotType: null,
    writeField: "promote_imoradar",
    kind: "boolean",
    source: "confirmed",
  },
  {
    id: "similar",
    label: "Proprietăți similare",
    slotType: "similar",
    writeField: "similar_properties",
    kind: "boolean",
    source: "configurable",
  },
  {
    id: "month",
    label: "Proprietățile lunii",
    slotType: "month",
    writeField: "properties_of_the_month",
    kind: "boolean",
    source: "configurable",
  },
  {
    id: "starter",
    label: "Starter",
    slotType: "starter",
    writeField: null,
    kind: "boolean",
    source: "configurable",
    note: "Portalul expune doar disponibilitatea; activarea nu este confirmată de API.",
  },
];

/** Toate valorile `slot_type` pe care le interogăm pentru inventar. */
export const IMOBILIARE_SLOT_TYPES: string[] = IMOBILIARE_PROMOTIONS.map(
  (promotion) => promotion.slotType,
).filter((slotType): slotType is string => slotType !== null);

export function imobiliarePromotion(id: string): ImobiliarePromotionDefinition | null {
  return IMOBILIARE_PROMOTIONS.find((promotion) => promotion.id === id) ?? null;
}

export function imobiliarePromotionBySlot(
  slotType: string,
): ImobiliarePromotionDefinition | null {
  return IMOBILIARE_PROMOTIONS.find((promotion) => promotion.slotType === slotType) ?? null;
}

/** Serviciile pe care utilizatorul le poate porni/opri din CRM. */
export function manageableImobiliarePromotions(): ImobiliarePromotionDefinition[] {
  return IMOBILIARE_PROMOTIONS.filter((promotion) => promotion.writeField !== null);
}

/* -------------------------------- inventar -------------------------------- */

export type ImobiliareSlotInventory = {
  slotType: string;
  total: number;
  used: number;
  /** Niciodată negativ, chiar dacă portalul raportează `used > total`. */
  available: number;
};

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

/**
 * Normalizează `GET /api/v3/promotions/slots/{slot_type}`.
 * Răspunsul documentat: `{ "data": { "total": n, "used": n } }`.
 * `null` = răspuns fără cifre utile: NU presupunem zero.
 */
export function normalizeImobiliareSlotInventory(
  slotType: string,
  body: unknown,
): ImobiliareSlotInventory | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const data =
    root["data"] && typeof root["data"] === "object"
      ? (root["data"] as Record<string, unknown>)
      : root;
  const total = integer(data["total"]);
  const used = integer(data["used"]);
  if (total === null && used === null) return null;
  const safeTotal = Math.max(total ?? 0, 0);
  const safeUsed = Math.max(used ?? 0, 0);
  return {
    slotType,
    total: safeTotal,
    used: safeUsed,
    available: Math.max(safeTotal - safeUsed, 0),
  };
}

/* ---------------------------- anunțuri pe slot ---------------------------- */

export type ImobiliareSlotListing = {
  /** `custom_reference` — legătura cu oferta Habitoo. */
  reference: string | null;
  /** ID-ul anunțului la portal, când este trimis. */
  listingId: string | null;
  title: string | null;
  /** Linkul public al anunțului, dacă portalul îl trimite. */
  url: string | null;
};

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Normalizează `GET /api/v3/promotions/listings/{slot_type}`. Portalul poate
 * întoarce lista direct în `data` sau împachetată (`data.items`/`data.listings`).
 */
export function parseImobiliareSlotListings(body: unknown): ImobiliareSlotListing[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const data = root["data"] ?? root;
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (["items", "listings", "data"]
          .map((key) => (data as Record<string, unknown>)[key])
          .find((value) => Array.isArray(value)) as unknown[] | undefined) ??
        Object.values(data as Record<string, unknown>).filter(
          (value) => value && typeof value === "object" && !Array.isArray(value),
        )
      : [];
  const listings: ImobiliareSlotListing[] = [];
  for (const row of rows ?? []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const reference = text(record["custom_reference"]) ?? text(record["reference"]);
    const listingId = text(record["id"]) ?? text(record["listing_id"]);
    if (!reference && !listingId) continue;
    const path = text(record["path"]);
    listings.push({
      reference,
      listingId,
      title: text(record["title"]) ?? text(record["name"]),
      url: text(record["url"]) ?? (path && path.startsWith("/") ? path : null),
    });
  }
  return listings;
}

/* -------------------------------- scriere --------------------------------- */

/**
 * Corpul cererii de scriere: DOAR serviciul modificat, fără rescrierea
 * celorlalte promovări (comportament documentat de portal).
 */
export function imobiliarePromotionPatch(
  definition: ImobiliarePromotionDefinition,
  value: boolean | number,
): { promotions: Record<string, boolean | number> } {
  if (!definition.writeField) {
    throw new Error(`Serviciul ${definition.label} nu poate fi modificat prin API.`);
  }
  const normalized =
    definition.kind === "numeric" ? Math.max(Math.trunc(Number(value) || 0), 0) : value === true;
  return { promotions: { [definition.writeField]: normalized } };
}

/** Câte puncte în plus poate cere utilizatorul, față de valoarea curentă. */
export function imobiliareEnergyCeiling(
  inventory: ImobiliareSlotInventory | null,
  current: number,
): number | null {
  if (!inventory) return null;
  return Math.max(current, 0) + inventory.available;
}

export type ImobiliarePromotionGuard =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Poarta de activare. Dezactivarea (sau scăderea unei valori numerice) este
 * MEREU permisă, chiar dacă sloturile sunt epuizate — altfel utilizatorul ar
 * rămâne blocat cu un serviciu pornit.
 */
export function guardImobiliarePromotionChange(input: {
  definition: ImobiliarePromotionDefinition;
  inventory: ImobiliareSlotInventory | null;
  /** Valoarea curentă cunoscută; `null` = necunoscută. */
  current: boolean | number | null;
  next: boolean | number;
}): ImobiliarePromotionGuard {
  const { definition, inventory, current, next } = input;
  if (!definition.writeField) {
    return {
      allowed: false,
      reason:
        definition.note ??
        `Serviciul ${definition.label} nu poate fi activat din CRM: portalul nu confirmă un câmp de comandă.`,
    };
  }

  if (definition.kind === "numeric") {
    const target = Math.max(Math.trunc(Number(next) || 0), 0);
    const currentValue = typeof current === "number" ? Math.max(current, 0) : 0;
    if (target <= currentValue) return { allowed: true };
    const ceiling = imobiliareEnergyCeiling(inventory, currentValue);
    if (ceiling === null) {
      return {
        allowed: false,
        reason: `Numărul de locuri pentru ${definition.label} nu a putut fi citit de la Imobiliare.ro. Sincronizează și încearcă din nou.`,
      };
    }
    if (target > ceiling) {
      return {
        allowed: false,
        reason: `Poți cere cel mult ${ceiling} ${definition.label.toLowerCase()} (locuri disponibile la Imobiliare.ro).`,
      };
    }
    return { allowed: true };
  }

  if (next !== true) return { allowed: true };
  if (current === true) return { allowed: true };
  // Serviciile fără contor (imoradar24) nu au limită de verificat.
  if (!definition.slotType) return { allowed: true };
  if (!inventory) {
    return {
      allowed: false,
      reason: `Numărul de locuri pentru ${definition.label} nu a putut fi citit de la Imobiliare.ro. Sincronizează și încearcă din nou.`,
    };
  }
  if (inventory.available <= 0) {
    return {
      allowed: false,
      reason: `Toate locurile ${definition.label} sunt ocupate (${inventory.used}/${inventory.total}). Eliberează un loc de la alt anunț sau cumpără locuri suplimentare la Imobiliare.ro.`,
    };
  }
  return { allowed: true };
}

/**
 * Starea curentă a unui serviciu pentru o ofertă, citită din corpul anunțului
 * (`GET /api/v3/listings/{ref}` → `data.promotions`). `null` = necunoscută;
 * nu deducem „inactiv” din lipsa câmpului.
 */
export function imobiliarePromotionStateFromListing(
  body: unknown,
  definition: ImobiliarePromotionDefinition,
): boolean | number | null {
  if (!definition.writeField) return null;
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const data =
    root["data"] && typeof root["data"] === "object"
      ? (root["data"] as Record<string, unknown>)
      : root;
  const promotions = data["promotions"];
  if (!promotions || typeof promotions !== "object" || Array.isArray(promotions)) return null;
  const raw = (promotions as Record<string, unknown>)[definition.writeField];
  if (raw === undefined || raw === null) return null;
  if (definition.kind === "numeric") {
    const value = integer(raw);
    return value === null ? null : Math.max(value, 0);
  }
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw > 0;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "on", "yes", "active"].includes(normalized)) return true;
    if (["0", "false", "off", "no", "inactive"].includes(normalized)) return false;
  }
  return null;
}
