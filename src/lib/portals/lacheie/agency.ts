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

/** Limitele de lungime documentate de La Cheie pentru `PUT /agencies`. */
export const LACHEIE_AGENCY_LIMITS = { name: 255, address: 255, email: 254, phone: 30 } as const;

/**
 * Datele reale ale agenției din Habitoo, fără nimic inventat.
 * `adminEmail` este emailul REAL și VERIFICAT al unui `agency_admin` al
 * organizației — niciodată emailul unui agent, al agenției sau o adresă tehnică.
 */
export type LaCheieAgencySource = {
  name: string | null;
  legalName?: string | null;
  adminEmail: string | null;
  phone: string | null;
  materialPhone?: string | null;
  address: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Maximum 30 de caractere și 7–15 cifre, cu formatare uzuală. */
export function isValidLaCheieAgencyPhone(value: unknown): value is string {
  const phone = text(value);
  if (!phone || phone.length > LACHEIE_AGENCY_LIMITS.phone) return false;
  if (!/^[0-9+()\-.\s/]+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

export type LaCheieAgencyField = "name" | "email" | "phone" | "address";

export type LaCheieAgencyPayloadBuild =
  | { ok: true; payload: LaCheieAgencyProfile }
  | { ok: false; missing: LaCheieAgencyField[]; issues: string[] };

/**
 * Construiește body-ul obligatoriu pentru `PUT /agencies/{external_id}`.
 * Nu inventează niciodată email, telefon sau adresă și NU mai substituie adresa
 * cu orașul: lipsa lor este raportată ca listă de câmpuri de completat.
 */
export function buildLaCheieAgencyPayload(source: LaCheieAgencySource): LaCheieAgencyPayloadBuild {
  const name = text(source.name) ?? text(source.legalName);
  const email = text(source.adminEmail);
  const phone = text(source.phone) ?? text(source.materialPhone);
  const address = text(source.address);

  const missing: LaCheieAgencyField[] = [];
  const issues: string[] = [];
  const fail = (field: LaCheieAgencyField, issue: string) => {
    missing.push(field);
    issues.push(issue);
  };

  if (!name) fail("name", "Denumirea agenției lipsește.");
  else if (name.length > LACHEIE_AGENCY_LIMITS.name) {
    fail("name", `Denumirea agenției depășește ${LACHEIE_AGENCY_LIMITS.name} de caractere.`);
  }

  if (!email) fail("email", "Emailul verificat al administratorului agenției lipsește.");
  else if (!EMAIL_PATTERN.test(email)) fail("email", "Emailul administratorului nu este valid.");
  else if (email.length > LACHEIE_AGENCY_LIMITS.email) {
    fail("email", `Emailul administratorului depășește ${LACHEIE_AGENCY_LIMITS.email} de caractere.`);
  }

  if (!phone) fail("phone", "Telefonul agenției lipsește.");
  else if (!isValidLaCheieAgencyPhone(phone)) {
    fail("phone", "Telefonul agenției trebuie să aibă maximum 30 de caractere și 7–15 cifre.");
  }

  if (!address) fail("address", "Adresa agenției lipsește.");
  else if (address.length > LACHEIE_AGENCY_LIMITS.address) {
    fail("address", `Adresa agenției depășește ${LACHEIE_AGENCY_LIMITS.address} de caractere.`);
  }

  if (missing.length) return { ok: false, missing, issues };
  return { ok: true, payload: { name: name!, email: email!, phone: phone!, address: address! } };
}

export const LACHEIE_AGENCY_FIELD_LABEL: Record<string, string> = {
  name: "Denumirea agenției",
  email: "Emailul verificat al administratorului agenției",
  phone: "Telefonul agenției",
  address: "Adresa agenției",
};

/* ------------------ emailul verificat al administratorului ---------------- */

export type LaCheieAdminEmailCandidate = {
  userId: string;
  email: string | null;
  /** `auth.users.email_confirmed_at`; `null` = neverificat, deci inutilizabil. */
  emailConfirmedAt: string | null;
  /** Utilizatorul care a declanșat activarea (dacă este `agency_admin`). */
  isActor?: boolean;
  /** Owner-ul organizației (ex. `organizations.created_by`). */
  isOwner?: boolean;
  /** Momentul acordării rolului, pentru ordonarea „primul agency_admin”. */
  roleGrantedAt?: string | null;
};

export type LaCheieAdminEmailSelection =
  | { ok: true; email: string; userId: string; source: "actor" | "owner" | "first_admin" }
  | { ok: false; reason: string };

export const LACHEIE_ADMIN_EMAIL_MISSING =
  "Activarea La Cheie cere emailul REAL și VERIFICAT al unui administrator de agenție. Niciun agency_admin al agenției nu are emailul confirmat. Confirmă adresa administratorului, apoi reia activarea.";

/**
 * Alege emailul trimis la La Cheie:
 *  - dacă activarea este declanșată de un `agency_admin` cu email verificat → al său;
 *  - altfel (ex. superadmin) → owner-ul agenției, apoi primul `agency_admin` verificat;
 *  - niciunul verificat → blocaj cu mesaj clar, fără substituiri.
 */
export function selectLaCheieAdminEmail(
  candidates: LaCheieAdminEmailCandidate[],
): LaCheieAdminEmailSelection {
  const verified = candidates.filter((candidate) => {
    const email = text(candidate.email);
    return Boolean(
      email &&
        EMAIL_PATTERN.test(email) &&
        email.length <= LACHEIE_AGENCY_LIMITS.email &&
        text(candidate.emailConfirmedAt),
    );
  });
  if (!verified.length) return { ok: false, reason: LACHEIE_ADMIN_EMAIL_MISSING };

  const pick = (
    candidate: LaCheieAdminEmailCandidate,
    source: "actor" | "owner" | "first_admin",
  ): LaCheieAdminEmailSelection => ({
    ok: true,
    email: text(candidate.email)!,
    userId: candidate.userId,
    source,
  });

  const actor = verified.find((candidate) => candidate.isActor === true);
  if (actor) return pick(actor, "actor");
  const owner = verified.find((candidate) => candidate.isOwner === true);
  if (owner) return pick(owner, "owner");
  const sorted = [...verified].sort((a, b) =>
    (a.roleGrantedAt ?? "").localeCompare(b.roleGrantedAt ?? ""),
  );
  return pick(sorted[0]!, "first_admin");
}


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

export const LACHEIE_AGENCY_PENDING_KEY = "lacheie_agency_pending";

export const LACHEIE_AGENCY_SETTINGS_KEYS = [
  "lacheie_agency_external_id",
  "lacheie_agency_status",
  "lacheie_agency_version",
  "lacheie_agency_accepted_version",
  "lacheie_agency_synced_at",
  "lacheie_agency_error",
  LACHEIE_AGENCY_PENDING_KEY,
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
  // Portalul v1 trimite `status` și `source_version` la rădăcină, iar `agency`
  // conține doar { id, name } — citim întâi scope-ul, apoi rădăcina.
  const accepted =
    normalizeSourceVersion(scope["accepted_version"]) ??
    normalizeSourceVersion(scope["source_version"]) ??
    normalizeSourceVersion(scope["version"]) ??
    normalizeSourceVersion(root["accepted_version"]) ??
    normalizeSourceVersion(root["source_version"]) ??
    normalizeSourceVersion(root["version"]);
  return {
    status: statusOf(scope["status"] ?? scope["state"] ?? root["status"] ?? root["state"]),
    acceptedVersion: accepted,
    name: text(scope["name"]),
  };
}
