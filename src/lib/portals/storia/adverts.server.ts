/**
 * Operațiile pe anunțuri Storia (OLX Group RE API), server-only.
 *
 *   POST   /advert/v1                       creează (asincron)
 *   PUT    /advert/v1/{uuid}                actualizează (asincron)
 *   POST   /advert/v1/{uuid}/deactivate     retrage anunțul
 *   GET    /advert/v1/{uuid}/meta           statusul real al anunțului
 *
 * Publicarea este ASINCRONĂ: răspunsul la creare confirmă doar că datele au
 * fost acceptate (`last_action_status: TO_POST`). Statusul real vine prin
 * notificări sau din `/meta`, așa că nu presupunem niciodată „activ”.
 */
import { PortalError, codeFromHttpStatus } from "../errors";
import type { PortalErrorCode } from "../errors";
import { olxAuthorizedRequest } from "./oauth.server";
import type { StoriaTransaction } from "./taxonomy";
import type { StoriaAdvert } from "./mapper";

/** Statusurile documentate în „advert status codes”. */
export const STORIA_STATUS_MESSAGE: Record<string, string> = {
  active: "publicat și vizibil pe Storia",
  new: "acceptat de Storia, încă nepublicat",
  unpaid: "acceptat, dar neplătit în contul Storia",
  blocked: "în verificare la moderatorii Storia",
  moderated: "respins de moderarea Storia",
  removed_by_moderator: "respins de moderarea Storia",
  removed_by_user: "retras din contul Storia",
  removed_by_parent_ad: "retras odată cu anunțul părinte",
  outdated: "expirat pe Storia",
};

/** Traducerea statusului portalului în starea internă a publicării. */
export function storiaListingStatus(code: string | null): string {
  if (!code) return "pending";
  if (code === "active") return "published";
  if (code === "new" || code === "unpaid" || code === "blocked") return "pending";
  // Retragerea (din CRM sau din contul Storia) este o stare normală, nu o eroare.
  if (code === "removed_by_user" || code === "removed_by_parent_ad") return "withdrawn";
  return "error";
}

/**
 * Ce se poate face cu un anunț inactiv, conform tabelelor „next available
 * operations” din documentația OLX (pagina publish-advert):
 *  - `removed_by_user`, `outdated` → ACTIVATE (dacă mai e vizibil în profil) sau POST;
 *  - `moderated`, `removed_by_moderator` → nicio operațiune, deci anunț nou (POST);
 *  - restul stărilor nu au nevoie de reactivare.
 */
export function storiaReactivationPlan(meta: {
  code: string | null;
  visibleInProfile: boolean | null;
}): "none" | "activate" | "recreate" {
  const code = meta.code;
  if (!code) return "none";
  if (code === "removed_by_user" || code === "outdated") {
    return meta.visibleInProfile === false ? "recreate" : "activate";
  }
  if (code === "moderated" || code === "removed_by_moderator" || code === "removed_by_parent_ad") {
    return "recreate";
  }
  return "none";
}

// ------------------------------------------------ referințe advert per ofertă

export type AdvertRefs = Partial<Record<StoriaTransaction, string>>;

/** `SALE:uuid|RENT:uuid` — o singură coloană `external_id` pentru ambele anunțuri. */
export function parseAdvertRefs(externalId: string | null): AdvertRefs {
  const refs: AdvertRefs = {};
  for (const part of (externalId ?? "").split("|")) {
    const [key, value] = part.split(":");
    if (!value) continue;
    const tx = key?.trim().toLowerCase();
    if (tx === "sale" || tx === "rent") refs[tx] = value.trim();
  }
  return refs;
}

export function serializeAdvertRefs(refs: AdvertRefs): string | null {
  const parts = (["sale", "rent"] as StoriaTransaction[])
    .filter((tx) => refs[tx])
    .map((tx) => `${tx.toUpperCase()}:${refs[tx]}`);
  return parts.length ? parts.join("|") : null;
}

/**
 * Storia expune DOUĂ identificatoare distincte pentru același anunț:
 *   - `AD:<id>` — id-ul numeric intern (`data.ad_id` din notificările de mesaje);
 *   - `ADSLUG:<id>` — id-ul din linkul public (`...-IDIwcT.html`), alfanumeric.
 *
 * Verificat pe date reale: `GET /advert/v1/{uuid}/meta` NU întoarce niciun id
 * numeric (doar `uuid`, `custom_fields.id` și `state.url`), deci id-ul numeric
 * nu poate fi derivat din link. Păstrăm ambele forme în `external_id` și facem
 * potrivirea mesajelor tolerantă la oricare dintre ele.
 */
function parseSegments(externalId: string | null, key: string): string[] {
  const out: string[] = [];
  for (const part of (externalId ?? "").split("|")) {
    const [k, value] = part.split(":");
    if (k?.trim().toUpperCase() === key && value?.trim()) out.push(value.trim());
  }
  return out;
}

function withSegment(externalId: string | null, key: string, value: string): string {
  const existing = (externalId ?? "").split("|").filter(Boolean);
  if (parseSegments(externalId, key).includes(value)) return existing.join("|");
  return [...existing, `${key}:${value}`].join("|");
}

/** Id-ul numeric intern al anunțului (`data.ad_id` din notificările de mesaje). */
export function parseStoriaAdIds(externalId: string | null): string[] {
  return parseSegments(externalId, "AD");
}

export function withStoriaAdId(externalId: string | null, adId: string): string {
  return withSegment(externalId, "AD", adId);
}

/** Id-ul din linkul public (slug), alfanumeric — util pentru afișare și potrivire. */
export function parseStoriaAdSlugs(externalId: string | null): string[] {
  return parseSegments(externalId, "ADSLUG");
}

export function withStoriaAdSlug(externalId: string | null, slug: string): string {
  return withSegment(externalId, "ADSLUG", slug);
}

/**
 * Id-ul din linkul public Storia. Formatul REAL confirmat pe un anunț live este
 * alfanumeric: `https://www.storia.ro/ro/oferta/apartament-test-IDIwcT.html`
 * → `IwcT`. NU este id-ul numeric folosit în notificările de mesaje.
 */
export function storiaAdSlugFromUrl(url: string | null): string | null {
  if (!url) return null;
  const patterns = [
    /-ID([A-Za-z0-9]{2,})\.html/,
    /\bID([A-Za-z0-9]{4,})\b/,
    /\/(\d{6,})(?:[-/.?#]|$)/,
  ];
  for (const re of patterns) {
    const match = re.exec(url);
    if (match?.[1]) return match[1];
  }
  return null;
}

// --------------------------------------------------------------- erori Storia

function detailOf(body: Record<string, unknown> | null): string | null {
  if (!body) return null;
  const parts: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  };
  push(body["title"]);
  push(body["detail"]);
  push(body["message"]);
  const validation = body["validation"];
  if (Array.isArray(validation)) {
    for (const item of validation.slice(0, 6)) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        const field =
          typeof rec["field"] === "string" ? rec["field"] : (rec["urn"] as string | undefined);
        const msg =
          typeof rec["message"] === "string"
            ? rec["message"]
            : (rec["detail"] as string | undefined);
        if (field || msg) parts.push([field, msg].filter(Boolean).join(": "));
      } else push(item);
    }
  }
  const joined = parts.join(" · ").slice(0, 500);
  return joined || null;
}

function failure(status: number, body: Record<string, unknown> | null): PortalError {
  const code: PortalErrorCode =
    status === 400 || status === 409 ? "VALIDATION_ERROR" : codeFromHttpStatus(status);
  const detail = detailOf(body);
  const message =
    code === "VALIDATION_ERROR"
      ? `Storia a respins anunțul: ${detail ?? "datele nu trec validarea portalului"}.`
      : code === "AUTH_ERROR"
        ? "Storia a refuzat tokenul agenției. Reia conectarea contului Storia."
        : code === "RATE_LIMIT"
          ? "Storia a limitat numărul de cereri. Reîncearcă în câteva minute."
          : code === "NOT_FOUND"
            ? "Storia nu mai găsește anunțul."
            : "Storia nu a răspuns corect. Reîncearcă în câteva minute.";
  return new PortalError(code, `http_${status}${detail ? ` ${detail}` : ""}`, message);
}

// ---------------------------------------------------------------- operațiuni

function advertUuid(body: Record<string, unknown> | null): string | null {
  const data = body?.["data"];
  if (data && typeof data === "object") {
    const uuid = (data as Record<string, unknown>)["uuid"];
    if (typeof uuid === "string" && uuid) return uuid;
  }
  return null;
}

export async function createAdvert(organizationId: string, advert: StoriaAdvert): Promise<string> {
  const res = await olxAuthorizedRequest(organizationId, "POST", "/advert/v1", advert);
  if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
    throw failure(res.status, res.body);
  }
  const uuid = advertUuid(res.body);
  if (!uuid) throw new PortalError("PORTAL_ERROR", "create_without_uuid");
  return uuid;
}

/**
 * Actualizare. `missing` = anunțul nu mai există la portal (404); `busy` = o
 * altă operațiune asincronă este încă în curs (409 „Illegal status change”),
 * caz în care datele se retrimit la următoarea publicare.
 */
export async function updateAdvert(
  organizationId: string,
  uuid: string,
  advert: StoriaAdvert,
): Promise<"updated" | "missing" | "busy"> {
  const res = await olxAuthorizedRequest(organizationId, "PUT", `/advert/v1/${uuid}`, advert);
  if (res.status === 404) return "missing";
  if (res.status === 409 && /illegal status change/i.test(res.raw)) return "busy";
  if (res.status < 200 || res.status >= 300) throw failure(res.status, res.body);
  return "updated";
}

/**
 * Așteaptă finalizarea operațiunii asincrone în curs (`last_action_status`
 * de forma `TO_*`) înainte de o nouă cerere de scriere. Best-effort.
 */
export async function waitForAdvertSettled(
  organizationId: string,
  uuid: string,
  attempts = 5,
  intervalMs = 3000,
): Promise<AdvertMeta | null> {
  let meta: AdvertMeta | null = null;
  for (let i = 0; i < attempts; i += 1) {
    meta = await readAdvertMeta(organizationId, uuid).catch(() => null);
    if (!meta?.lastActionStatus || !/^TO_/i.test(meta.lastActionStatus)) return meta;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return meta;
}

export async function deactivateAdvert(
  organizationId: string,
  uuid: string,
): Promise<"deactivated" | "missing"> {
  const res = await olxAuthorizedRequest(organizationId, "POST", `/advert/v1/${uuid}/deactivate`);
  if (res.status === 404) return "missing";
  if (res.status < 200 || res.status >= 300) throw failure(res.status, res.body);
  return "deactivated";
}

/**
 * Reactivarea unui anunț dezactivat: `POST /advert/v1/{uuid}/activate`.
 * Portalul acceptă operațiunea doar pentru anunțuri dezactivate care mai sunt
 * vizibile în profilul utilizatorului; altfel răspunde 4xx și trebuie creat un
 * anunț nou. De aceea nu aruncăm pentru 400/403/404/409.
 */
export async function activateAdvert(
  organizationId: string,
  uuid: string,
): Promise<"activated" | "not_allowed"> {
  const res = await olxAuthorizedRequest(organizationId, "POST", `/advert/v1/${uuid}/activate`);
  if (res.status >= 200 && res.status < 300) return "activated";
  if (res.status === 400 || res.status === 403 || res.status === 404 || res.status === 409) {
    return "not_allowed";
  }
  throw failure(res.status, res.body);
}

export type AdvertMeta = {
  uuid: string;
  lastActionStatus: string | null;
  code: string | null;
  url: string | null;
  moderationReason: string | null;
  /** `state.visible_in_profile` — condiție pentru activate/deactivate. */
  visibleInProfile: boolean | null;
};

/**
 * Statusul real al anunțului. Documentația marchează `/meta` drept soluție
 * temporară față de notificări, așa că îl folosim doar ca lectură best-effort.
 */
export async function readAdvertMeta(
  organizationId: string,
  uuid: string,
): Promise<AdvertMeta | null> {
  const res = await olxAuthorizedRequest(organizationId, "GET", `/advert/v1/${uuid}/meta`);
  if (res.status < 200 || res.status >= 300) return null;
  const data = res.body?.["data"];
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const state = (rec["state"] && typeof rec["state"] === "object" ? rec["state"] : {}) as Record<
    string,
    unknown
  >;
  const moderation = (
    state["moderation"] && typeof state["moderation"] === "object" ? state["moderation"] : {}
  ) as Record<string, unknown>;
  const visible = state["visible_in_profile"];
  return {
    uuid,
    visibleInProfile:
      typeof visible === "boolean"
        ? visible
        : typeof visible === "string"
          ? visible.toLowerCase() === "true"
          : null,

    lastActionStatus:
      typeof rec["last_action_status"] === "string" ? rec["last_action_status"] : null,
    code: typeof state["code"] === "string" ? state["code"] : null,
    url: typeof state["url"] === "string" ? state["url"] : null,
    moderationReason:
      typeof moderation["description"] === "string"
        ? moderation["description"]
        : typeof moderation["reason"] === "string"
          ? moderation["reason"]
          : null,
  };
}
