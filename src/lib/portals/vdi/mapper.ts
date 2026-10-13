/**
 * VDI.ro — mapare pură (fără rețea, fără DB), după documentația oficială:
 * https://vdi.ro/en/documentatie-api/8o3AfHgVfwJYgEXaqETXW5jQnUGwtPCKGE5VDE75
 *
 * - răspunsul are o singură cheie, `eroare`, și la succes, și la respingere;
 * - `idintern` = partea numerică a codului intern (HB-1172 → 1172), imuabil;
 * - `optiuni` NU se trimite: o valoare necunoscută respinge tot anunțul.
 */

export const VDI_MIN_TITLE = 10;
/** Limita contului de probă VDI.ro: 20 de poze pe anunț (max 8 MB fiecare). */
export const VDI_MAX_PHOTOS = 20;

/* ------------------------------- răspunsuri ------------------------------- */

export type VdiParsed =
  | { ok: true; operation: "add" | "mod" | "del"; vdiId: string | null; link: string | null; text: string }
  | { ok: false; text: string; kind: "invalid_key" | "expired" | "rejected" };

const SUCCESS = /^Proprietatea a fost (adaugata|modificata|stearsa)/i;

/** Corpul brut, tăiat la 200 de caractere, pentru erorile cu formă necunoscută. */
function rawBodyPreview(body: unknown): string {
  let text: string;
  try {
    text = typeof body === "string" ? body : JSON.stringify(body) ?? "";
  } catch {
    text = String(body);
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** Valoarea cheii `succes` (număr sau text nevid), dacă există; altfel null. */
function successValue(record: Record<string, unknown> | null): string | null {
  const raw = record?.["succes"];
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/** Citește textul, nu cheia: `eroare` apare și la succes; `succes` (nedocumentat) e tot succes. */
export function parseVdiResponse(body: unknown): VdiParsed {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const raw = record?.["eroare"];
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    const succes = successValue(record);
    if (succes !== null) {
      // Formă nedocumentată observată în producție: {"succes": 1000}. ID-ul/linkul
      // lipsesc și se completează ulterior din `cat=list` (sincronizarea existentă).
      const id = /ID:\s*([^\s|]+)/i.exec(succes)?.[1] ?? null;
      const link = /Link:\s*(https?:\/\/\S+)/i.exec(succes)?.[1] ?? null;
      return { ok: true, operation: "add", vdiId: id, link, text: `succes: ${succes}` };
    }
    return { ok: false, text: `Răspuns VDI.ro neașteptat: ${rawBodyPreview(body) || "(gol)"}`, kind: "rejected" };
  }
  const match = SUCCESS.exec(text);
  if (match) {
    const verb = match[1]!.toLowerCase();
    const id = /ID:\s*([^\s|]+)/i.exec(text)?.[1] ?? null;
    const link = /Link:\s*(https?:\/\/\S+)/i.exec(text)?.[1] ?? null;
    return {
      ok: true,
      operation: verb === "adaugata" ? "add" : verb === "modificata" ? "mod" : "del",
      vdiId: id,
      link,
      text,
    };
  }
  if (/^Cheie invalida/i.test(text)) return { ok: false, text, kind: "invalid_key" };
  if (/^Abonamentul a expirat/i.test(text)) return { ok: false, text, kind: "expired" };
  return { ok: false, text, kind: "rejected" };
}

/** Răspunsul agenților: orice text care nu e o eroare cunoscută e succes doar dacă spune „adaugat/modificat”. */
export function parseVdiAgentResponse(body: unknown): { ok: boolean; text: string; notFound?: boolean } {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const raw = record?.["eroare"];
  const text = typeof raw === "string" ? raw.trim() : "";
  if (/(a fost|au fost)\s+(adaugat|modificat|actualizat)/i.test(text)) return { ok: true, text };
  if (text) return { ok: false, text, notFound: /nu a fost gasit|nu exista/i.test(text) };
  const succes = successValue(record);
  if (succes !== null) return { ok: true, text: `succes: ${succes}` };
  return { ok: false, text: `Răspuns VDI.ro neașteptat: ${rawBodyPreview(body) || "(gol)"}` };
}

/* ------------------------------- identificatori ------------------------------- */

/** HB-1172 → 1172; HB-0042 → 42. `null` dacă nu există cifre. */
export function vdiIdIntern(reference: string | null | undefined): number | null {
  const digits = (reference ?? "").match(/\d+/g)?.join("") ?? "";
  if (!digits) return null;
  const value = Number(digits.replace(/^0+(?=\d)/, ""));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/* ------------------------------- stări (sync) ------------------------------- */

export type VdiState = "activ" | "inactiv" | "tranzactionat" | "sters";

/** Starea VDI → starea listării Habitoo: doar „activ” rămâne publicat. */
export function mapVdiState(state: string): "published" | "withdrawn" | null {
  switch (state) {
    case "activ":
      return "published";
    case "inactiv":
    case "tranzactionat":
    case "sters":
      return "withdrawn";
    default:
      return null;
  }
}

/* ------------------------------- anunț ------------------------------- */

export type VdiProperty = {
  reference: string | null;
  externalIdintern: string | null;
  propertyType: string | null;
  layout: string | null;
  title: string | null;
  forSale: boolean;
  forRent: boolean;
  salePrice: number | null;
  saleCurrency: string | null;
  rentPrice: number | null;
  rentCurrency: string | null;
  price: number | null;
  currency: string | null;
  negotiable: boolean | null;
  county: string | null;
  city: string | null;
  district: string | null;
  usableSurface: number | null;
  builtSurface: number | null;
  landSurface: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  floorLabel: string | null;
  buildingFloors: number | null;
  photoUrls: string[];
};

export type VdiListingPayload = {
  idintern: number;
  idagent?: number;
  titlu: string;
  tipoferta: number;
  tipoperatiune: 1 | 2;
  judetul: string;
  localitatea: string;
  cartierul?: string;
  moneda: 1 | 2;
  pretvanzare?: number;
  pretinchiriere?: number;
  negociabil?: 0 | 1;
  suprafatautila?: number;
  suprafataconstruita?: number;
  suprafatateren?: number;
  numarcamere?: string;
  numarbai?: string;
  etajul?: string;
  etaje?: string;
  poze?: string;
};

const TYPE_CODE: Record<string, number> = {
  apartment: 1,
  apartament: 1,
  house: 2,
  casa: 2,
  vila: 2,
  villa: 2,
  commercial: 3,
  spatiu_comercial: 3,
  land: 4,
  teren: 4,
  industrial: 5,
  office: 6,
  birou: 6,
  studio: 7,
  garsoniera: 7,
  hotel: 8,
  pensiune: 8,
};

export function vdiOfferType(propertyType: string | null, layout?: string | null): number | null {
  const key = (propertyType ?? "").trim().toLowerCase();
  if (key === "apartment" && /garsonier|studio/i.test(layout ?? "")) return 7;
  return TYPE_CODE[key] ?? null;
}

function currencyCode(value: string | null): 1 | 2 | null {
  const v = (value ?? "EUR").trim().toUpperCase();
  if (v === "EUR") return 1;
  if (v === "RON" || v === "LEI") return 2;
  return null;
}

/** „parter”, „demisol”, „mansarda” sau număr. */
export function vdiFloor(floor: number | null, label: string | null): string | undefined {
  const l = (label ?? "").toLowerCase();
  if (/parter/.test(l)) return "parter";
  if (/demisol/.test(l)) return "demisol";
  if (/mansard/.test(l)) return "mansarda";
  if (floor === null) return undefined;
  if (floor === 0) return "parter";
  if (floor < 0) return "demisol";
  return String(Math.trunc(floor));
}

function positive(n: number | null): number | undefined {
  return n !== null && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

/** Fără diacritice (ș/ş→s, ț/ţ→t, ă/â→a, î→i, și majuscule); cratimele rămân. */
export function vdiAscii(s: string): string {
  return s
    .replace(/[șş]/g, "s").replace(/[ȘŞ]/g, "S")
    .replace(/[țţ]/g, "t").replace(/[ȚŢ]/g, "T")
    .replace(/[ăâ]/g, "a").replace(/[ĂÂ]/g, "A")
    .replace(/î/g, "i").replace(/Î/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lista exactă de județe VDI.ro (București și Ilfov unite). */
export const VDI_COUNTIES = [
  "Alba", "Arad", "Arges", "Bacau", "Bihor", "Bistrita Nasaud", "Botosani", "Braila", "Brasov", "Bucuresti Ilfov",
  "Buzau", "Calarasi", "Caras Severin", "Cluj", "Constanta", "Covasna", "Dambovita", "Dolj", "Galati", "Giurgiu",
  "Gorj", "Harghita", "Hunedoara", "Ialomita", "Iasi", "Maramures", "Mehedinti", "Mures", "Neamt", "Olt",
  "Prahova", "Salaj", "Satu Mare", "Sibiu", "Suceava", "Teleorman", "Timis", "Tulcea", "Valcea", "Vaslui", "Vrancea",
] as const;

function countyKey(s: string): string {
  return vdiAscii(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(judetul|jud|municipiul|mun)\s+/, "")
    .trim();
}

/** Județ CRM → valoare din lista VDI.ro; null dacă nu există. */
export function vdiCounty(county: string): string | null {
  const k = countyKey(county);
  if (/^bucuresti\b/.test(k) || k === "ilfov" || /^sector(ul)? \d$/.test(k)) return "Bucuresti Ilfov";
  return VDI_COUNTIES.find((c) => countyKey(c) === k) ?? null;
}

/** București (cu sau fără sector) → „Bucuresti”; cartier = zona sau „Sector N”. Fără diacritice. */
export function splitLocality(city: string, district: string | null): { bucuresti: boolean; localitate: string; cartier: string | null } {
  const c = vdiAscii(city);
  const d = district ? vdiAscii(district) : "";
  const m = /^(?:(?:mun(?:icipiul|\.)?\s+)?Bucuresti(?:\s+Sector(?:ul)?\s*(\d))?|Sector(?:ul)?\s*(\d))$/i.exec(c);
  if (m) {
    const n = m[1] ?? m[2];
    return { bucuresti: true, localitate: "Bucuresti", cartier: d || (n ? `Sector ${n}` : null) };
  }
  return { bucuresti: false, localitate: c, cartier: d || null };
}

export function vdiTitle(title: string | null, fallback: string): string {
  const t = (title ?? "").replace(/\s+/g, " ").trim();
  if (t.length >= VDI_MIN_TITLE) return t;
  const combined = `${t ? `${t} — ` : ""}${fallback}`.trim();
  return combined.length >= VDI_MIN_TITLE ? combined : combined.padEnd(VDI_MIN_TITLE, ".");
}

export type VdiMapResult =
  | { ok: true; payload: VdiListingPayload; warnings: string[] }
  | { ok: false; reasons: string[] };

export function mapPropertyToVdi(p: VdiProperty, agentId: number | null): VdiMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const idintern = p.externalIdintern ? vdiIdIntern(p.externalIdintern) : vdiIdIntern(p.reference);
  if (idintern === null) reasons.push("codul intern al proprietății nu are o parte numerică");

  const tipoferta = vdiOfferType(p.propertyType, p.layout);
  if (tipoferta === null) reasons.push("tipul proprietății nu este acceptat de VDI.ro");

  if (!p.forSale && !p.forRent) reasons.push("alege vânzare sau închiriere");
  const sale = p.forSale;
  if (p.forSale && p.forRent) warnings.push("Oferta este și de vânzare, și de închiriere: pe VDI.ro se trimite vânzarea.");

  const price = sale ? (p.salePrice ?? p.price) : (p.rentPrice ?? p.price);
  const moneda = currencyCode(sale ? (p.saleCurrency ?? p.currency) : (p.rentCurrency ?? p.currency));
  if (!price || price <= 0) reasons.push("prețul lipsește");
  if (moneda === null) reasons.push("moneda trebuie să fie EUR sau RON");

  if (!p.county?.trim()) reasons.push("județul lipsește");
  if (!p.city?.trim()) reasons.push("localitatea lipsește");
  const judet = p.county?.trim() ? vdiCounty(p.county) : null;
  if (p.county?.trim() && judet === null) reasons.push(`Județul ${p.county.trim()} nu există în lista VDI.ro`);

  if (reasons.length > 0) return { ok: false, reasons };

  const { bucuresti, localitate, cartier } = splitLocality(p.city!, p.district);
  const titleCity = bucuresti ? "București" : p.city!.trim();
  const typeLabel = ["", "Apartament", "Casă", "Spațiu comercial", "Teren", "Spațiu industrial", "Birou", "Garsonieră", "Hotel"][tipoferta!]!;
  const payload: VdiListingPayload = {
    idintern: idintern!,
    titlu: vdiTitle(p.title, `${typeLabel} ${titleCity}`),
    tipoferta: tipoferta!,
    tipoperatiune: sale ? 2 : 1,
    judetul: judet!,
    localitatea: localitate,
    moneda: moneda!,
  };
  if (agentId !== null) payload.idagent = agentId;
  if (cartier) payload.cartierul = cartier;
  if (sale) payload.pretvanzare = Math.round(price!);
  else payload.pretinchiriere = Math.round(price!);
  if (p.negotiable !== null) payload.negociabil = p.negotiable ? 1 : 0;
  const su = positive(p.usableSurface);
  const sc = positive(p.builtSurface);
  const st = positive(p.landSurface);
  if (su !== undefined) payload.suprafatautila = su;
  if (sc !== undefined) payload.suprafataconstruita = sc;
  if (st !== undefined) payload.suprafatateren = st;
  if (p.rooms) payload.numarcamere = String(Math.trunc(p.rooms));
  if (p.bathrooms) payload.numarbai = String(Math.trunc(p.bathrooms));
  const etaj = vdiFloor(p.floor, p.floorLabel);
  if (etaj !== undefined) payload.etajul = etaj;
  if (p.buildingFloors) payload.etaje = String(Math.trunc(p.buildingFloors));
  const photos = p.photoUrls.filter((u) => /^https:\/\//.test(u) && !u.includes(",")).slice(0, VDI_MAX_PHOTOS);
  if (photos.length > 0) payload.poze = photos.join(",");
  else warnings.push("Oferta nu are nicio poză eligibilă pentru publicare.");
  return { ok: true, payload, warnings };
}

/* ------------------------------- agent ------------------------------- */

export type VdiAgentPayload = {
  idintern: number;
  firstname: string;
  lastname: string;
  email: string;
  phone?: string;
  photo?: string;
};

export function mapAgentToVdi(
  agent: { fullName: string | null; email: string | null; phone: string | null; avatarUrl: string | null },
  idintern: number,
): { ok: true; payload: VdiAgentPayload } | { ok: false; reason: string } {
  const email = agent.email?.trim();
  if (!email) return { ok: false, reason: "Agentul responsabil nu are email: VDI.ro creează contul agentului pe email. Completează emailul în profil." };
  const parts = (agent.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstname = parts[0] ?? email.split("@")[0]!;
  const lastname = parts.slice(1).join(" ") || firstname;
  const payload: VdiAgentPayload = { idintern, firstname, lastname, email };
  if (agent.phone?.trim()) payload.phone = agent.phone.trim();
  if (agent.avatarUrl && /^https:\/\//.test(agent.avatarUrl)) payload.photo = agent.avatarUrl;
  return { ok: true, payload };
}

/** Amprenta datelor agentului trimise la VDI (nume, email, telefon, poză). */
export function vdiAgentFingerprint(p: VdiAgentPayload): string {
  const s = JSON.stringify([p.firstname, p.lastname, p.email.toLowerCase(), p.phone ?? "", p.photo ?? ""]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `v1:${h.toString(16)}:${s.length}`;
}
