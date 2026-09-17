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

/* ------------------- operații idempotente pe agenție ---------------------- */

export type LaCheieAgencyOperation = "register" | "reactivate" | "deactivate";

/**
 * Operația de agenție pornită și neconfirmată încă de portal.
 * Un retry al ACELEIAȘI operații refolosește EXACT aceeași versiune și același
 * corp; o versiune nouă se alocă doar după un răspuns definitiv.
 */
export type LaCheieAgencyPending = {
  operation: LaCheieAgencyOperation;
  version: string;
  /** SHA-256 al corpului JSON exact trimis (plus operația). */
  bodyHash: string;
  startedAt: string | null;
};

function operationOf(value: unknown): LaCheieAgencyOperation | null {
  const raw = text(value);
  return raw === "register" || raw === "reactivate" || raw === "deactivate" ? raw : null;
}

export function readLaCheieAgencyPending(
  settings: Record<string, unknown> | null,
): LaCheieAgencyPending | null {
  const raw = (settings ?? {})[LACHEIE_AGENCY_PENDING_KEY];
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const operation = operationOf(record["operation"]);
  const version = normalizeSourceVersion(record["version"]);
  const bodyHash = text(record["body_hash"] ?? record["bodyHash"]);
  if (!operation || !version || !bodyHash) return null;
  return {
    operation,
    version,
    bodyHash,
    startedAt: text(record["started_at"] ?? record["startedAt"]),
  };
}

const HEX = "0123456789abcdef";

/** SHA-256 hex al corpului exact (operație + JSON), fără dependențe de Node. */
export async function laCheieAgencyBodyHash(
  operation: LaCheieAgencyOperation,
  body: unknown,
): Promise<string> {
  const payload = JSON.stringify({ operation, body: body ?? null });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  let out = "";
  for (const byte of new Uint8Array(digest)) {
    out += HEX[byte >> 4]! + HEX[byte & 15]!;
  }
  return out;
}

/**
 * Reactivare = există o înregistrare ACCEPTATĂ anterior de portal.
 * O primă înregistrare eșuată rămâne o înregistrare: versiunea rezervată local
 * nu transformă următoarea încercare în reactivare.
 */
export function isLaCheieAgencyReactivation(state: LaCheieAgencyState): boolean {
  return Boolean(state.acceptedVersion);
}

export type LaCheieAgencyPlan = {
  operation: LaCheieAgencyOperation;
  version: string;
  /** `true` = retry identic al operației în curs (aceeași versiune, același corp). */
  reused: boolean;
};

/** Decide versiunea folosită: retry identic → aceeași versiune; altfel una nouă. */
export function planLaCheieAgencyOperation(input: {
  state: LaCheieAgencyState;
  pending: LaCheieAgencyPending | null;
  operation: LaCheieAgencyOperation;
  bodyHash: string;
}): LaCheieAgencyPlan {
  const { pending } = input;
  if (pending && pending.operation === input.operation && pending.bodyHash === input.bodyHash) {
    return { operation: input.operation, version: pending.version, reused: true };
  }
  return {
    operation: input.operation,
    version: nextLaCheieAgencyVersion(input.state),
    reused: false,
  };
}

export function laCheieAgencyPendingPatch(
  plan: LaCheieAgencyPlan,
  bodyHash: string,
  startedAt: string,
): Record<string, unknown> {
  return {
    [LACHEIE_AGENCY_PENDING_KEY]: {
      operation: plan.operation,
      version: plan.version,
      body_hash: bodyHash,
      started_at: startedAt,
    },
  };
}

export function laCheieAgencyPendingCleared(): Record<string, unknown> {
  return { [LACHEIE_AGENCY_PENDING_KEY]: null };
}

/* ------------------ interpretarea răspunsurilor /agencies ----------------- */

export const LACHEIE_AGENCY_SUSPENDED_MESSAGE =
  "Agenția este suspendată administrativ de La Cheie; reactivarea nu este posibilă din CRM. Contactați La Cheie.";
export const LACHEIE_AGENCY_ASSOCIATION_CONFLICT_MESSAGE =
  "Emailul administratorului este folosit la La Cheie de un cont personal/de agent sau agenția are deja o conexiune individuală. Contactați La Cheie.";

export type LaCheieAgencyOutcome = {
  status: LaCheieAgencyStatus;
  message: string | null;
  acceptedVersion: string | null;
  /** Răspuns definitiv (2xx, 400, 403, 409) → se poate aloca o versiune nouă. */
  definitive: boolean;
  /** Timeout, rețea, 429 sau 5xx → operația rămâne pending, cu aceeași versiune. */
  keepPending: boolean;
  /** 409 pe versiune: se citește versiunea acceptată prin GET, apoi retry mai mare. */
  versionConflict: boolean;
};

/**
 * Codurile prin care La Cheie semnalează un conflict de VERSIUNE. Nu se caută
 * cuvântul „version” în corp: un conflict de asociere poate conține `source_version`
 * fără să fie un conflict de versiune.
 */
const LACHEIE_VERSION_CONFLICT_CODES = new Set([
  "version_conflict",
  "source_version_conflict",
  "stale_version",
  "outdated_version",
  "invalid_source_version",
]);

function versionConflictCode(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const error = (body as { error?: unknown }).error;
  const code =
    error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && LACHEIE_VERSION_CONFLICT_CODES.has(code.toLowerCase());
}


/** Versiunea acceptată raportată explicit într-un conflict de versiune. */
function conflictAcceptedVersion(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  const scope = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  for (const key of ["accepted_version", "acceptedVersion", "accepted_source_version"]) {
    const value = normalizeSourceVersion(scope[key] ?? (body as Record<string, unknown>)[key]);
    if (value) return value;
  }
  return null;
}

/** Interpretează `PUT /agencies/{external_id}` conform contractului v1. */
export function classifyLaCheieAgencyPut(input: {
  httpStatus: number;
  body: unknown;
  conflictAcceptedVersion?: string | null;
  previousStatus: LaCheieAgencyStatus;
  fallbackMessage?: string | null;
}): LaCheieAgencyOutcome {
  const { httpStatus, body } = input;
  const parsed = parseLaCheieAgencyBody(body);

  if (httpStatus >= 200 && httpStatus < 300) {
    return {
      // 201 asociere nouă / 200 reactivare sau retry identic: statusul vine din rădăcină.
      status: parsed.status === "not_registered" ? "active" : parsed.status,
      message: null,
      acceptedVersion: parsed.acceptedVersion,
      definitive: true,
      keepPending: false,
      versionConflict: false,
    };
  }

  if (httpStatus === 403) {
    return {
      status: "suspended",
      message: LACHEIE_AGENCY_SUSPENDED_MESSAGE,
      acceptedVersion: parsed.acceptedVersion,
      definitive: true,
      keepPending: false,
      versionConflict: false,
    };
  }

  if (httpStatus === 409) {
    // Doar o versiune acceptată raportată EXPLICIT pentru conflict (sau un cod de
    // conflict de versiune) califică drept conflict de versiune. Un `source_version`
    // oarecare din corp aparține unui conflict de asociere și nu se reia automat.
    const accepted =
      normalizeSourceVersion(input.conflictAcceptedVersion) ?? conflictAcceptedVersion(body);
    const isVersionConflict = Boolean(accepted) || versionConflictCode(body);
    return {
      status: isVersionConflict ? input.previousStatus : "error",
      message: isVersionConflict
        ? "Versiunea agenției nu este acceptată de La Cheie. Se citește versiunea acceptată și se reia cu o versiune mai mare."
        : LACHEIE_AGENCY_ASSOCIATION_CONFLICT_MESSAGE,
      acceptedVersion: accepted,
      definitive: true,
      keepPending: false,
      versionConflict: isVersionConflict,
    };
  }

  const transient = httpStatus === 0 || httpStatus === 408 || httpStatus === 429 || httpStatus >= 500;
  return {
    status: transient ? input.previousStatus : "error",
    message:
      input.fallbackMessage ??
      (httpStatus === 0
        ? "La Cheie nu a putut fi contactat. Operația rămâne în curs și se reia identic."
        : `La Cheie a răspuns HTTP ${httpStatus}.`),
    acceptedVersion: parsed.acceptedVersion,
    definitive: !transient,
    keepPending: transient,
    versionConflict: false,
  };
}

/**
 * `DELETE /agencies/{external_id}`: statusul se citește din răspuns.
 * O suspendare administrativă rămâne „suspended”, nu devine „inactive”.
 * `404` = deja inactivă.
 */
export function laCheieAgencyStatusAfterDelete(input: {
  httpStatus: number;
  body: unknown;
  previousStatus: LaCheieAgencyStatus;
}): { ok: boolean; status: LaCheieAgencyStatus; keepPending: boolean } {
  const { httpStatus } = input;
  if (httpStatus === 404) {
    return {
      ok: true,
      status: input.previousStatus === "suspended" ? "suspended" : "inactive",
      keepPending: false,
    };
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    const reported = parseLaCheieAgencyBody(input.body).status;
    if (reported === "suspended" || input.previousStatus === "suspended") {
      return { ok: true, status: "suspended", keepPending: false };
    }
    return { ok: true, status: "inactive", keepPending: false };
  }
  const transient = httpStatus === 0 || httpStatus === 408 || httpStatus === 429 || httpStatus >= 500;
  return { ok: false, status: input.previousStatus, keepPending: transient };
}
