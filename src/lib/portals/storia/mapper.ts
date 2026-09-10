/**
 * Mapper pur Habitoo → Storia.ro (OLX Group RE API). Fără DB, fără rețea.
 *
 * Regulile respectate sunt cele din „Advert validation rules”:
 *  - `title` 5–70 caractere, fără cuvinte scrise integral cu majuscule;
 *  - `description` minim 50 caractere, fără emoji;
 *  - `category_urn` din taxonomia Storia (fără invenții de URN);
 *  - `price` întreg pozitiv (0 ar însemna „preț la cerere”), moneda EUR sau RON;
 *  - `location.lat`/`lon` obligatorii, `exact` doar dacă locația e marcată exactă;
 *  - minim o imagine cu URL public;
 *  - `custom_fields.id` = identificatorul nostru stabil, imun la editări.
 *
 * O proprietate cu ambele tranzacții active produce DOUĂ anunțuri distincte.
 */
import {
  feedImageUrl,
  isImageFeedEligible,
  type ProfileRow,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";
import { publicCoords } from "@/lib/geo";
import { storiaAttributesFor } from "./attributes";
import {
  ATTRIBUTE_LABEL,
  REQUIRED_ATTRIBUTES,
  storiaCategoryUrn,
  storiaFamily,
  type StoriaTransaction,
} from "./taxonomy";
import { STORIA_SITE_URN } from "./config";

export const STORIA_MIN_TITLE = 5;
export const STORIA_MAX_TITLE = 70;
export const STORIA_MIN_DESCRIPTION = 50;
export const STORIA_MAX_DESCRIPTION = 65535;
export const STORIA_MAX_IMAGES = 40;
export const STORIA_CURRENCIES = ["EUR", "RON"] as const;

export type StoriaAttribute = { urn: string; value: string };

export type StoriaAdvert = {
  title: string;
  description: string;
  category_urn: string;
  contact?: { name: string; email: string; phone?: string };
  price: { value: number; currency: string };
  location: { lat: number; lon: number; exact: boolean };
  images: { url: string }[];
  attributes: StoriaAttribute[];
  site_urn: string;
  custom_fields: { id: string; reference_id?: string };
  market: "primary" | "secondary";
  auto_extend: boolean;
};

export type StoriaListing = { transaction: StoriaTransaction; advert: StoriaAdvert };

export type StoriaMapResult =
  | { ok: true; listings: StoriaListing[]; warnings: string[] }
  | { ok: false; reasons: string[] };

/** Identificator stabil trimis în `custom_fields.id`. */
export function storiaCustomId(property: Pick<PropertyRow, "id">, transaction: StoriaTransaction): string {
  return `HBT-${property.id}-${transaction.toUpperCase()}`;
}

/** Tranzacțiile active: dual (vânzare + închiriere) produce două anunțuri. */
export function storiaTransactions(p: PropertyRow): StoriaTransaction[] {
  const list: StoriaTransaction[] = [];
  if (p.for_sale) list.push("sale");
  if (p.for_rent) list.push("rent");
  if (list.length === 0 && p.transaction_kind === "sale") list.push("sale");
  if (list.length === 0 && p.transaction_kind === "rent") list.push("rent");
  return list;
}

/** Storia respinge cuvintele scrise integral cu majuscule. */
export function softenUppercase(text: string): string {
  return text.replace(/\p{Lu}{2,}/gu, (word) => word.charAt(0) + word.slice(1).toLowerCase());
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;

function stripEmoji(text: string): string {
  return text.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").trim();
}

/** Cifrele telefonului: Storia acceptă 7–14 cifre. */
export function storiaPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 14) return null;
  return digits;
}

function priceFor(p: PropertyRow, transaction: StoriaTransaction) {
  const raw = transaction === "sale" ? (p.sale_price ?? p.price) : (p.rent_price ?? p.price);
  const currency = (
    (transaction === "sale" ? p.sale_currency : p.rent_currency) ??
    p.currency ??
    "EUR"
  )
    .toString()
    .trim()
    .toUpperCase();
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return { value: null as number | null, currency, rounded: false };
  }
  const value = Math.round(raw);
  return { value: value > 0 ? value : null, currency, rounded: value !== raw };
}

/** Piața: „primary” doar când stadiul construcției indică explicit ansamblu nou. */
export function storiaMarket(p: PropertyRow): "primary" | "secondary" {
  const stage = (p.construction_stage ?? "").toString().toLowerCase();
  return /nou|construc|dezvolt|ansamblu|primary/.test(stage) ? "primary" : "secondary";
}

export type StoriaMapOptions = {
  /** Origin pentru URL-urile publice de imagine (HTTPS în producție). */
  baseUrl: string;
  images?: PropertyImageRow[];
  agent?: Pick<ProfileRow, "full_name" | "email" | "phone"> | null;
  organizationPhone?: string | null;
  organizationEmail?: string | null;
};

export function mapPropertyToStoria(p: PropertyRow, options: StoriaMapOptions): StoriaMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  let title = softenUppercase((p.title ?? "").trim());
  if (title !== (p.title ?? "").trim()) {
    warnings.push("Titlul avea cuvinte scrise integral cu majuscule; Storia le refuză, așa că au fost normalizate.");
  }
  if (title.length < STORIA_MIN_TITLE) {
    reasons.push(`Titlul trebuie să aibă minimum ${STORIA_MIN_TITLE} caractere.`);
  }
  if (title.length > STORIA_MAX_TITLE) {
    reasons.push(
      `Titlul depășește limita Storia de ${STORIA_MAX_TITLE} caractere (are ${title.length}). Scurtează-l înainte de publicare.`,
    );
  }

  let description = stripEmoji((p.description ?? "").trim());
  if (description !== (p.description ?? "").trim()) {
    warnings.push("Descrierea conținea emoji; Storia nu le acceptă, așa că au fost eliminate.");
  }
  if (description.length < STORIA_MIN_DESCRIPTION) {
    reasons.push(
      `Descrierea trebuie să aibă minimum ${STORIA_MIN_DESCRIPTION} caractere (are ${description.length}).`,
    );
  }
  if (description.length > STORIA_MAX_DESCRIPTION) {
    description = description.slice(0, STORIA_MAX_DESCRIPTION);
    warnings.push("Descrierea a fost scurtată la limita Storia.");
  }

  const family = storiaFamily(p.property_type);
  if (!family) {
    reasons.push(
      `Tipul de proprietate „${p.property_type ?? "necunoscut"}” nu are categorie corespondentă pe Storia.`,
    );
  }

  const transactions = storiaTransactions(p);
  if (transactions.length === 0) {
    reasons.push("Nu este bifată nicio tranzacție (vânzare sau închiriere).");
  }

  const categories = transactions.map((t) => ({
    transaction: t,
    urn: storiaCategoryUrn(p.property_type, t),
  }));
  for (const entry of categories) {
    if (family && !entry.urn) {
      reasons.push(
        entry.transaction === "sale"
          ? "Storia nu are categorie de vânzare pentru acest tip de proprietate."
          : "Storia nu are categorie de închiriere pentru acest tip de proprietate.",
      );
    }
  }

  const agentName = softenUppercase((options.agent?.full_name ?? "").trim());
  const agentEmail = (options.agent?.email ?? "").trim();
  const phone = storiaPhone(options.agent?.phone) ?? storiaPhone(options.organizationPhone);
  if (!phone && (options.agent?.phone || options.organizationPhone)) {
    warnings.push("Telefonul de contact nu are între 7 și 14 cifre, așa că nu se trimite către Storia.");
  }
  const contactEmail = agentEmail || (options.organizationEmail ?? "").trim();
  const useContact = Boolean(agentName && contactEmail);
  if (!useContact) {
    warnings.push(
      "Anunțul folosește contactul implicit al contului Storia: agentul asignat nu are nume și email complete.",
    );
  }

  const coords = publicCoords(p);
  if (!coords) {
    reasons.push("Storia cere coordonate: setează locația pe hartă în pagina ofertei.");
  }

  const eligibleImages = (options.images ?? [])
    .filter(isImageFeedEligible)
    .sort((a, b) =>
      a.is_primary === b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1,
    );
  if (eligibleImages.length === 0) {
    reasons.push("Oferta nu are nicio imagine publicabilă (Storia cere minimum una).");
  }
  if (eligibleImages.length > STORIA_MAX_IMAGES) {
    warnings.push(
      `Oferta are ${eligibleImages.length} imagini publicabile; se trimit primele ${STORIA_MAX_IMAGES}.`,
    );
  }

  const priced = transactions.map((t) => ({ transaction: t, ...priceFor(p, t) }));
  for (const entry of priced) {
    if (entry.value === null) {
      reasons.push(
        entry.transaction === "sale"
          ? "Lipsește prețul de vânzare sau nu este pozitiv."
          : "Lipsește prețul de închiriere sau nu este pozitiv.",
      );
    } else if (entry.rounded) {
      warnings.push(
        entry.transaction === "sale"
          ? `Prețul de vânzare a fost rotunjit la ${entry.value} (Storia cere valoare întreagă).`
          : `Prețul de închiriere a fost rotunjit la ${entry.value} (Storia cere valoare întreagă).`,
      );
    }
    if (!(STORIA_CURRENCIES as readonly string[]).includes(entry.currency)) {
      reasons.push(
        `Moneda „${entry.currency}” nu este acceptată pe Storia (doar EUR sau RON) pentru ${
          entry.transaction === "sale" ? "vânzare" : "închiriere"
        }.`,
      );
    }
  }

  // Atribute: exclusiv cele confirmate în taxonomia reală Storia, per categorie.
  // Lipsa unui atribut marcat obligatoriu de Storia blochează publicarea, cu
  // mesaj despre exact ce trebuie completat în ofertă.
  const market = storiaMarket(p);
  const attributesByCategory = new Map<string, StoriaAttribute[]>();
  for (const entry of categories) {
    if (!entry.urn || attributesByCategory.has(entry.urn)) continue;
    const attributes = storiaAttributesFor(p, entry.urn, market);
    attributesByCategory.set(entry.urn, attributes);
    for (const urn of REQUIRED_ATTRIBUTES[entry.urn] ?? []) {
      if (!attributes.some((a) => a.urn === urn)) {
        reasons.push(
          `Storia cere ${ATTRIBUTE_LABEL[urn] ?? urn} pentru această categorie; completează câmpul în ofertă.`,
        );
      }
    }
  }

  if (reasons.length) return { ok: false, reasons: [...new Set(reasons)] };

  const images = eligibleImages
    .slice(0, STORIA_MAX_IMAGES)
    .map((img) => ({ url: feedImageUrl(options.baseUrl, img.id) }));

  if (transactions.length === 2) {
    warnings.push(
      "Proprietatea are ambele tranzacții active: se trimit două anunțuri separate pe Storia (vânzare și închiriere).",
    );
  }

  const reference = (p.reference ?? "").trim();

  const listings: StoriaListing[] = priced.map((entry) => {
    const categoryUrn = categories.find((c) => c.transaction === entry.transaction)?.urn as string;
    const attributes = attributesByCategory.get(categoryUrn) ?? [];
    const advert: StoriaAdvert = {
      title,
      description,
      category_urn: categoryUrn,
      price: { value: entry.value as number, currency: entry.currency },
      location: { lat: coords!.lat, lon: coords!.lng, exact: p.location_precise === true },
      images,
      attributes,
      site_urn: STORIA_SITE_URN,
      custom_fields: {
        id: storiaCustomId(p, entry.transaction),
        ...(reference ? { reference_id: reference } : {}),
      },
      market,
      auto_extend: true,
    };
    if (useContact) {
      advert.contact = {
        name: agentName,
        email: contactEmail,
        ...(phone ? { phone } : {}),
      };
    }
    return { transaction: entry.transaction, advert };
  });

  return { ok: true, listings, warnings };
}
