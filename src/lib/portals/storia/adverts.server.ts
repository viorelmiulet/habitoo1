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
  return "error";
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
        const field = typeof rec["field"] === "string" ? rec["field"] : (rec["urn"] as string | undefined);
        const msg = typeof rec["message"] === "string" ? rec["message"] : (rec["detail"] as string | undefined);
        if (field || msg) parts.push([field, msg].filter(Boolean).join(": "));
      } else push(item);
    }
  }
  const joined = parts.join(" · ").slice(0, 500);
  return joined || null;
}

function failure(status: number, body: Record<string, unknown> | null): PortalError {
  const code: PortalErrorCode = status === 400 || status === 409 ? "VALIDATION_ERROR" : codeFromHttpStatus(status);
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

/** Actualizare; `null` înseamnă că anunțul nu mai există la portal (404). */
export async function updateAdvert(
  organizationId: string,
  uuid: string,
  advert: StoriaAdvert,
): Promise<"updated" | "missing"> {
  const res = await olxAuthorizedRequest(organizationId, "PUT", `/advert/v1/${uuid}`, advert);
  if (res.status === 404) return "missing";
  if (res.status < 200 || res.status >= 300) throw failure(res.status, res.body);
  return "updated";
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

export type AdvertMeta = {
  uuid: string;
  lastActionStatus: string | null;
  code: string | null;
  url: string | null;
  moderationReason: string | null;
};

/**
 * Statusul real al anunțului. Documentația marchează `/meta` drept soluție
 * temporară față de notificări, așa că îl folosim doar ca lectură best-effort.
 */
export async function readAdvertMeta(organizationId: string, uuid: string): Promise<AdvertMeta | null> {
  const res = await olxAuthorizedRequest(organizationId, "GET", `/advert/v1/${uuid}/meta`);
  if (res.status < 200 || res.status >= 300) return null;
  const data = res.body?.["data"];
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const state = (rec["state"] && typeof rec["state"] === "object" ? rec["state"] : {}) as Record<string, unknown>;
  const moderation = (state["moderation"] && typeof state["moderation"] === "object"
    ? state["moderation"]
    : {}) as Record<string, unknown>;
  return {
    uuid,
    lastActionStatus: typeof rec["last_action_status"] === "string" ? rec["last_action_status"] : null,
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
