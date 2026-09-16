/**
 * Modelul de agenție La Cheie (funcții pure: fără rețea, fără DB, fără secrete).
 *
 * Model real de furnizor CRM:
 *  - CRM-ul are O SINGURĂ cheie de furnizor (`lc_crm_…`), păstrată exclusiv
 *    server-side; agențiile nu o primesc și nu o văd niciodată;
 *  - fiecare agenție are un `external_id` stabil, un status propriu
 *    (active/inactive/suspended) și o versiune de agenție independentă de
 *    versiunile ofertelor;
 *  - după activare, `/account` și `/properties` trimit suplimentar
 *    `X-Agency-External-ID`; `/options`, `/counties`, `/cities` nu îl cer.
 */
import { FIRST_SOURCE_VERSION, nextSourceVersion, normalizeSourceVersion } from "./version";

/** 1–64 caractere ASCII, stabil, separat de id-urile ofertelor. */
export const LACHEIE_AGENCY_EXTERNAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type LaCheieAgencyStatus = "not_registered" | "active" | "inactive" | "suspended" | "error";

export const LACHEIE_AGENCY_STATUS_LABEL: Record<LaCheieAgencyStatus, string> = {
  not_registered: "Neînregistrată",
  active: "Activă",
  inactive: "Dezactivată",
  suspended: "Suspendată administrativ",
  error: "Eroare",
};

export function isValidLaCheieAgencyExternalId(value: unknown): value is string {
  return typeof value === "string" && LACHEIE_AGENCY_EXTERNAL_ID_PATTERN.test(value);
}

/** Identificator stabil, derivat din id-ul agenției din Habitoo. */
export function laCheieAgencyExternalId(organizationId: string): string {
  const normalized = organizationId.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return `hbt-${normalized}`.slice(0, 64);
}

export type LaCheieAgencyProfile = {
  name: string;
  email: string;
  phone: string;
  address: string;
};

/** Datele reale ale agenției din Habitoo, fără nimic inventat. */
export type LaCheieAgencySource = {
  name: string | null;
  legalName?: string | null;
  email: string | null;
  materialEmail?: string | null;
  phone: string | null;
  materialPhone?: string | null;
  address: string | null;
  city?: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type LaCheieAgencyPayloadBuild =
  | { ok: true; payload: LaCheieAgencyProfile }
  | { ok: false; missing: ("name" | "email" | "phone" | "address")[] };

/**
 * Construiește body-ul obligatoriu pentru `PUT /agencies/{external_id}`.
 * Nu inventează niciodată email, telefon sau adresă: lipsa lor este raportată
 * ca listă de câmpuri de completat în Habitoo.
 */
export function buildLaCheieAgencyPayload(source: LaCheieAgencySource): LaCheieAgencyPayloadBuild {
  const name = text(source.name) ?? text(source.legalName);
  const email = text(source.email) ?? text(source.materialEmail);
  const phone = text(source.phone) ?? text(source.materialPhone);
  const address = text(source.address) ?? text(source.city);

  const missing: ("name" | "email" | "phone" | "address")[] = [];
  if (!name) missing.push("name");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) missing.push("email");
  if (!phone) missing.push("phone");
  if (!address) missing.push("address");
  if (missing.length) return { ok: false, missing };

  return { ok: true, payload: { name: name!, email: email!, phone: phone!, address: address! } };
}

export const LACHEIE_AGENCY_FIELD_LABEL: Record<string, string> = {
  name: "Denumirea agenției",
  email: "Emailul agenției",
  phone: "Telefonul agenției",
  address: "Adresa agenției",
};

/* ------------------------------ setări salvate ---------------------------- */

export type LaCheieAgencyState = {
  externalId: string | null;
  status: LaCheieAgencyStatus;
  /** Versiunea agenției — independentă de versiunile ofertelor. */
  version: string | null;
  acceptedVersion: string | null;
  syncedAt: string | null;
  error: string | null;
};

export const LACHEIE_AGENCY_SETTINGS_KEYS = [
  "lacheie_agency_external_id",
  "lacheie_agency_status",
  "lacheie_agency_version",
  "lacheie_agency_accepted_version",
  "lacheie_agency_synced_at",
  "lacheie_agency_error",
] as const;

function statusOf(value: unknown): LaCheieAgencyStatus {
  const raw = text(value)?.toLowerCase();
  if (raw === "active") return "active";
  if (raw === "inactive" || raw === "deactivated" || raw === "disabled") return "inactive";
  if (raw === "suspended" || raw === "blocked") return "suspended";
  if (raw === "error") return "error";
  return "not_registered";
}

export function readLaCheieAgencyState(settings: Record<string, unknown> | null): LaCheieAgencyState {
  const raw = settings ?? {};
  const externalId = text(raw["lacheie_agency_external_id"]);
  return {
    externalId: isValidLaCheieAgencyExternalId(externalId) ? externalId : null,
    status: statusOf(raw["lacheie_agency_status"]),
    version: normalizeSourceVersion(raw["lacheie_agency_version"]),
    acceptedVersion: normalizeSourceVersion(raw["lacheie_agency_accepted_version"]),
    syncedAt: text(raw["lacheie_agency_synced_at"]),
    error: text(raw["lacheie_agency_error"]),
  };
}

/** Prima înregistrare folosește versiunea 1; reactivarea cere o versiune mai mare. */
export function nextLaCheieAgencyVersion(state: LaCheieAgencyState): string {
  if (!state.version) return FIRST_SOURCE_VERSION;
  return nextSourceVersion({ current: state.version, accepted: state.acceptedVersion });
}

/** Suspendarea administrativă NU poate fi ocolită din CRM. */
export function canActivateLaCheieAgency(status: LaCheieAgencyStatus): boolean {
  return status !== "suspended";
}

export function laCheieAgencyBlockReason(state: LaCheieAgencyState): string | null {
  if (!state.externalId || state.status === "not_registered") {
    return "Agenția nu este înregistrată la La Cheie. Activează conexiunea înainte de publicare.";
  }
  if (state.status === "suspended") {
    return "Conexiunea agenției este suspendată administrativ de La Cheie. Contactează portalul; suspendarea nu poate fi ocolită din CRM.";
  }
  if (state.status !== "active") {
    return "Conexiunea agenției la La Cheie nu este activă. Reactivează-o, apoi retrimite ofertele complete.";
  }
  return null;
}

/* --------------------------- răspunsuri de la API ------------------------- */

export type LaCheieAgencyResponse = {
  status: LaCheieAgencyStatus;
  acceptedVersion: string | null;
  name: string | null;
};

/** Citește statusul și versiunea acceptată din corpul unui răspuns `/agencies`. */
export function parseLaCheieAgencyBody(body: unknown): LaCheieAgencyResponse {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const scope = (root["agency"] ?? root["data"] ?? root) as Record<string, unknown>;
  const accepted =
    normalizeSourceVersion(scope["accepted_version"]) ??
    normalizeSourceVersion(scope["source_version"]) ??
    normalizeSourceVersion(scope["version"]) ??
    normalizeSourceVersion(root["accepted_version"]);
  return {
    status: statusOf(scope["status"] ?? scope["state"]),
    acceptedVersion: accepted,
    name: text(scope["name"]),
  };
}
