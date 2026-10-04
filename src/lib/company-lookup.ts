// Căutarea firmei după CUI în registrul public ANAF (PlatitorTvaRest v9).
// Modul pur: normalizare, cifră de control, parser, reguli de completare. Apelul extern e injectat.

export type CompanyStatus = "activa" | "inactiva" | "radiata";

export type CompanyInfo = {
  cui: string;
  legalName: string;
  tradeRegistryNumber: string | null;
  address: string | null;
  postalCode: string | null;
  county: string | null;
  city: string | null;
  phone: string | null;
  status: CompanyStatus;
  /** Data inactivării fiscale (yyyy-MM-dd), doar când firma e inactivă. */
  inactiveSince?: string | null;
  vatPayer: boolean;
};

export type LookupResult =
  | { ok: true; company: CompanyInfo; alreadyRegistered: boolean }
  | { ok: false; reason: "invalid" | "not_found" | "unavailable" | "rate_limited"; message: string };

export const LOOKUP_MESSAGES = {
  invalid: "CUI invalid. Verifică cifrele.",
  not_found: "Nu am găsit firma. Verifică CUI-ul sau completează manual",
  unavailable: "Registrul ANAF nu răspunde acum. Poți continua completând manual.",
  rate_limited: "Prea multe căutări într-un minut. Încearcă din nou puțin mai târziu.",
} as const;

export const DUPLICATE_CUI_MESSAGE =
  "Există deja o agenție înregistrată cu acest CUI. Cere administratorului agenției o invitație în echipă.";

export const COMPANY_STATUS_LABEL: Record<CompanyStatus, string> = {
  activa: "Activă",
  inactiva: "Inactivă",
  radiata: "Radiată",
};

export const ANAF_URL = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";
export const ANAF_TIMEOUT_MS = 8000;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const LOOKUP_RATE_LIMIT = { limit: 10, windowSeconds: 60 };

/** Elimină „RO", spații, puncte; `null` dacă nu rămân 2–10 cifre. */
export function normalizeCui(raw: string): string | null {
  const v = String(raw ?? "").toUpperCase().replace(/[\s.\-]/g, "").replace(/^RO/, "");
  return /^\d{2,10}$/.test(v) ? v : null;
}

/** Cifra de control CUI (cheia 753217532). */
export function isValidCuiChecksum(cui: string): boolean {
  if (!/^\d{2,10}$/.test(cui)) return false;
  const key = "753217532";
  const control = Number(cui[cui.length - 1]);
  const body = cui.slice(0, -1).padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * Number(key[i]);
  let c = (sum * 10) % 11;
  if (c === 10) c = 0;
  return c === control;
}

export function validateCui(raw: string): string | null {
  const n = normalizeCui(raw);
  return n && isValidCuiChecksum(n) ? n : null;
}

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s ? s : null;
};

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());

/** „MUN. CLUJ-NAPOCA" → „Cluj-Napoca"; „SECTOR 1" rămâne cu București. */
export function cleanLocality(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw
    .replace(/^(MUN\.?|MUNICIPIUL|ORŞ\.?|ORȘ\.?|ORS\.?|ORAŞ(UL)?|ORAȘ(UL)?|ORAS(UL)?|COM\.?|COMUNA|SAT)\s+/i, "")
    .trim();
  if (/^SECTOR(UL)?\s*\d/i.test(v)) return "București";
  return v ? titleCase(v) : null;
}

export function cleanCounty(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.replace(/^(JUD\.?|JUDE[ŢȚT]UL)\s+/i, "").trim();
  if (/BUCURE/i.test(v)) return "București";
  return v ? titleCase(v) : null;
}

/** Extrage județul și localitatea din adresa completă („JUD. X, MUN. Y, STR. ..."). */
export function parseAddressText(address: string | null): { county: string | null; city: string | null } {
  if (!address) return { county: null, city: null };
  const parts = address.split(",").map((p) => p.trim());
  let county: string | null = null;
  let city: string | null = null;
  for (const p of parts) {
    if (!county && /^(JUD\.?|JUDE[ŢȚT]UL)\s/i.test(p)) county = cleanCounty(p);
    else if (!county && /^MUNICIPIUL BUCURE/i.test(p)) {
      county = "București";
      city = "București";
    } else if (!city && /^(MUN\.?|MUNICIPIUL|OR[ŞȘS]\.?|ORA[ŞȘS]|COM\.?|COMUNA|SAT)\s/i.test(p)) city = cleanLocality(p);
    else if (!city && /^SECTOR/i.test(p)) city = "București";
  }
  return { county, city };
}

/** Cod poștal din ANAF (ex. „14584") → 6 cifre („014584"); `null` dacă nu e valid. */
export function normalizePostalCode(raw: string | null): string | null {
  const v = String(raw ?? "").replace(/\D/g, "");
  if (!v || v.length > 6 || /^0+$/.test(v)) return null;
  return v.length >= 4 ? v.padStart(6, "0") : null;
}

/** Sediul social: sector (București), strada, numărul, detaliile. */
export function buildSeatAddress(seat: Record<string, unknown>): string | null {
  const loc = str(seat["sdenumire_Localitate"]) ?? "";
  const sector = /SECTOR(UL)?\s*(\d)/i.exec(loc);
  const street = str(seat["sdenumire_Strada"]);
  const nr = str(seat["snumar_Strada"]);
  const details = str(seat["sdetalii_Adresa"]);
  if (!street && !details) return null;
  return [sector ? `Sector ${sector[2]}` : null, street, nr ? `nr. ${nr}` : null, details]
    .filter(Boolean)
    .join(", ");
}

export function statusFrom(general: Record<string, unknown>, inactive: Record<string, unknown>): CompanyStatus {
  const reg = String(general["stare_inregistrare"] ?? "");
  if (/RADIER|RADIAT/i.test(reg) || str(inactive["dataRadiere"])) return "radiata";
  if (inactive["statusInactivi"] === true) return "inactiva";
  return "activa";
}

/**
 * Parser tolerant: acceptă `found[0].date_generale` (v9) și `found[0]` plat (versiuni vechi).
 * `null` dacă firma nu e în `found`.
 */
export function parseAnafResponse(body: unknown, cui: string): CompanyInfo | null {
  const found = (body as { found?: unknown[] } | null)?.found;
  if (!Array.isArray(found) || found.length === 0) return null;
  const item = found[0] as Record<string, unknown>;
  const nested = item["date_generale"] && typeof item["date_generale"] === "object";
  const g = (nested ? item["date_generale"] : item) as Record<string, unknown>;
  const inactive = ((nested ? item["stare_inactiv"] : item) ?? {}) as Record<string, unknown>;
  const vat = ((nested ? item["inregistrare_scop_Tva"] : item) ?? {}) as Record<string, unknown>;
  const seat = (item["adresa_sediu_social"] ?? {}) as Record<string, unknown>;
  const legalName = str(g["denumire"]);
  if (!legalName) return null;
  const address = str(g["adresa"]);
  const fromText = parseAddressText(address);
  return {
    cui,
    legalName,
    tradeRegistryNumber: str(g["nrRegCom"]),
    address: buildSeatAddress(seat) ?? address,
    postalCode: normalizePostalCode(str(seat["scod_Postal"])) ?? normalizePostalCode(str(g["codPostal"])),
    county: cleanCounty(str(seat["sdenumire_Judet"])) ?? fromText.county,
    city: cleanLocality(str(seat["sdenumire_Localitate"])) ?? fromText.city,
    phone: str(g["telefon"]),
    status: statusFrom(g, inactive),
    inactiveSince: statusFrom(g, inactive) === "inactiva" ? str(inactive["dataInactivare"]) : null,
    vatPayer: vat["scpTVA"] === true,
  };
}

export type LookupDeps = {
  now: () => Date;
  rateAllow: () => Promise<boolean>;
  cacheGet: (cui: string) => Promise<{ found: boolean; result: CompanyInfo | null; fetchedAt: string } | null>;
  cachePut: (cui: string, found: boolean, result: CompanyInfo | null) => Promise<void>;
  /** Corpul JSON de la ANAF; aruncă la timeout sau eroare de rețea. */
  fetchAnaf: (cui: number, date: string) => Promise<unknown>;
  cuiTaken: (cui: string) => Promise<boolean>;
};

/** Datele firmei (din cache 24h sau ANAF). Nu atinge rate limit-ul când CUI-ul e invalid. */
export async function fetchCompany(
  deps: Omit<LookupDeps, "rateAllow" | "cuiTaken">,
  cui: string,
): Promise<{ ok: true; company: CompanyInfo } | { ok: false; reason: "not_found" | "unavailable" }> {
  const cached = await deps.cacheGet(cui);
  if (cached && deps.now().getTime() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    return cached.found && cached.result ? { ok: true, company: cached.result } : { ok: false, reason: "not_found" };
  }
  let body: unknown;
  try {
    body = await deps.fetchAnaf(Number(cui), deps.now().toISOString().slice(0, 10));
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!body || typeof body !== "object" || !("found" in body || "notFound" in body)) {
    return { ok: false, reason: "unavailable" };
  }
  const company = parseAnafResponse(body, cui);
  await deps.cachePut(cui, Boolean(company), company);
  return company ? { ok: true, company } : { ok: false, reason: "not_found" };
}

export async function lookupCompany(deps: LookupDeps, raw: string): Promise<LookupResult> {
  const cui = validateCui(raw);
  if (!cui) return { ok: false, reason: "invalid", message: LOOKUP_MESSAGES.invalid };
  if (!(await deps.rateAllow())) return { ok: false, reason: "rate_limited", message: LOOKUP_MESSAGES.rate_limited };
  const r = await fetchCompany(deps, cui);
  if (!r.ok) return { ok: false, reason: r.reason, message: LOOKUP_MESSAGES[r.reason] };
  return { ok: true, company: r.company, alreadyRegistered: await deps.cuiTaken(cui) };
}

type OrgCompanyRow = {
  legal_name?: string | null;
  cui?: string | null;
  trade_registry_number?: string | null;
  registered_address?: string | null;
  material_address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  county?: string | null;
};

const ORG_FIELD_FROM_COMPANY: Array<[keyof OrgCompanyRow, keyof CompanyInfo, string]> = [
  ["legal_name", "legalName", "Denumire legală"],
  ["trade_registry_number", "tradeRegistryNumber", "Nr. Registrul Comerțului"],
  ["registered_address", "address", "Sediul social"],
  ["material_address", "address", "Adresa biroului"],
  ["postal_code", "postalCode", "Cod poștal"],
  ["city", "city", "Oraș"],
  ["county", "county", "Județ"],
];

const empty = (v: unknown) => !String(v ?? "").trim();

/** Doar câmpurile goale ale organizației; ce a editat utilizatorul nu se suprascrie. */
export function buildOrgSyncPatch(org: OrgCompanyRow, c: CompanyInfo, now: Date): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  for (const [col, key] of ORG_FIELD_FROM_COMPANY) {
    const v = c[key];
    if (empty(org[col]) && typeof v === "string" && v.trim()) patch[col] = v.trim();
  }
  if (typeof patch.postal_code === "string") {
    const pc = normalizePostalCode(patch.postal_code);
    if (pc) patch.postal_code = pc;
    else delete patch.postal_code;
  }
  Object.assign(patch, companyStatePatch(c, now));
  return patch;
}
const col6 = (v: string | null) => normalizePostalCode(v);

export type CompanyDiff = { field: string; label: string; current: string | null; next: string };

/** Diferențele pentru „Reîncarcă datele din ANAF" (aplicate doar după confirmare). */
export function diffOrgWithCompany(org: OrgCompanyRow, c: CompanyInfo): CompanyDiff[] {
  const out: CompanyDiff[] = [];
  for (const [col, key, label] of ORG_FIELD_FROM_COMPANY) {
    if (col === "material_address") continue; // adresa biroului e aleasă de agenție
    const next = c[key];
    if (typeof next !== "string" || !next.trim()) continue;
    if (col === "postal_code" && !col6(next)) continue;
    const cur = (org[col] ?? null) as string | null;
    if ((cur ?? "").trim() !== next.trim()) out.push({ field: col, label, current: cur, next: next.trim() });
  }
  return out;
}

/** Sincronizarea se reîncearcă cel mult o dată pe zi cât firma e neverificată. */
export function shouldSyncOrg(
  org: { cui?: string | null; company_verified_at?: string | null; company_sync_attempted_at?: string | null },
  now: Date,
): boolean {
  if (!validateCui(org.cui ?? "")) return false;
  if (org.company_verified_at) return false;
  if (!org.company_sync_attempted_at) return true;
  return now.getTime() - new Date(org.company_sync_attempted_at).getTime() >= CACHE_TTL_MS;
}

/** Starea fiscală: se actualizează la fiecare verificare ANAF (nu e editabilă de agenție). */
export function companyStatePatch(c: CompanyInfo, now: Date) {
  return {
    company_status: c.status,
    company_inactive_since: c.status === "inactiva" ? (c.inactiveSince ?? null) : null,
    company_verified_at: now.toISOString(),
  };
}

/** „7 decembrie 2021" din „2021-12-07". */
export function formatRoDate(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function inactiveWarning(since: string | null | undefined): string {
  const d = formatRoDate(since);
  return d
    ? `Conform ANAF, această firmă figurează ca inactivă fiscal din ${d}`
    : "Conform ANAF, această firmă figurează ca inactivă fiscal";
}
