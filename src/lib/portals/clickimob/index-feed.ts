/**
 * Indexul ClickImob (JSON): logică pură, testabilă izolat.
 * Aceleași reguli ca indexul Properstar (activare, grație 7 zile), refolosite
 * direct din `properstar/index-feed.ts` fără a le modifica.
 *
 * Tokenul de feed: `hbci_<id>.<HMAC-SHA256("clickimob:" + id, CLICKIMOB_INDEX_KEY)>`.
 * Acceptarea lui în `/sites/v1` NU e activă încă.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IndexPresence } from "@/lib/portals/properstar/index-feed";

export const CLICKIMOB_INDEX_VERSION = "habitoo-clickimob-index/1.0";
export const CLICKIMOB_TOKEN_PREFIX = "hbci_";

export const CLICKIMOB_INDEX_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache, must-revalidate",
};

export function signClickimobAgency(id: string, key: string): string {
  return createHmac("sha256", key).update(`clickimob:${id}`).digest("hex");
}

export function clickimobFeedToken(id: string, key: string): string {
  return `${CLICKIMOB_TOKEN_PREFIX}${id}.${signClickimobAgency(id, key)}`;
}

/** Întoarce id-ul agenției dacă tokenul e valid, altfel null (timing-safe). */
export function verifyClickimobFeedToken(
  token: string | null | undefined,
  key: string | null | undefined,
): string | null {
  if (!key || !token || !token.startsWith(CLICKIMOB_TOKEN_PREFIX)) return null;
  const body = token.slice(CLICKIMOB_TOKEN_PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = body.slice(0, dot);
  const sig = body.slice(dot + 1).trim().toLowerCase();
  const expected = Buffer.from(signClickimobAgency(id, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return id;
}

/** Compară cheia indexului în timp constant. */
export function verifyClickimobIndexKey(candidate: string, key: string | null | undefined): boolean {
  if (!key || !candidate) return false;
  const a = createHmac("sha256", "clickimob-index").update(candidate).digest();
  const b = createHmac("sha256", "clickimob-index").update(key).digest();
  return timingSafeEqual(a, b);
}

/** Conexiune ClickImob pe agenție (cheie Habitoo / agency_id) → exclusă din index. */
export function hasPerAgencyClickimob(input: {
  externalAccountId: string | null | undefined;
  activeKeys: number;
}): boolean {
  return Boolean(input.externalAccountId?.trim()) || input.activeKeys > 0;
}

export type ClickimobIndexAgency = {
  id: string;
  name: string | null;
  legal_name: string | null;
  cui: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  county: string | null;
  city: string | null;
  address: string | null;
  logo_url: string | null;
  status: Exclude<IndexPresence, "gone">;
  inactive_since: string | null;
  updated_at: string;
  feed: { base_url: string; token: string };
};

export type ClickimobIndex = {
  version: string;
  generated_at: string;
  agencies: ClickimobIndexAgency[];
};

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export type ClickimobOrgRow = {
  name: string | null;
  legal_name: string | null;
  cui: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  logo_url: string | null;
  material_address: string | null;
  material_email: string | null;
  material_phone: string | null;
  material_website: string | null;
  updated_at: string;
};

/** Datele de contact: `material_*` au prioritate, ca la Properstar. Fără valori inventate. */
export function clickimobAgencyContact(org: ClickimobOrgRow) {
  return {
    name: clean(org.name),
    legal_name: clean(org.legal_name),
    cui: clean(org.cui),
    email: clean(org.material_email) ?? clean(org.email),
    phone: clean(org.material_phone) ?? clean(org.phone),
    website: clean(org.material_website),
    county: null as string | null,
    city: clean(org.city),
    address: clean(org.material_address),
    logo_url: clean(org.logo_url),
  };
}

/**
 * „Mod index”: ClickImob activat, fără conexiune pe agenție. Exact regula de
 * includere din indexul ClickImob (refolosește `hasPerAgencyClickimob`).
 */
export function isClickimobIndexMode(input: {
  activated: boolean | null | undefined;
  externalAccountId: string | null | undefined;
  activeKeys: number;
}): boolean {
  return input.activated === true && !hasPerAgencyClickimob(input);
}

/** Conexiune pregătită: status connected/ready sau ClickImob în mod index. */
export function portalConnectionReady(
  portalId: string,
  connection:
    | { status?: string | null; activated?: boolean | null; external_account_id?: string | null }
    | null
    | undefined,
  activeKeyPortals: Set<string>,
): boolean {
  if (connection?.status === "connected" || connection?.status === "ready") return true;
  if (portalId !== "clickimob") return false;
  return isClickimobIndexMode({
    activated: connection?.activated,
    externalAccountId: connection?.external_account_id,
    activeKeys: activeKeyPortals.has("clickimob") ? 1 : 0,
  });
}
