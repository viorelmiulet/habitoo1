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

/** Conexiune pregătită: status connected/ready; ClickImob e gata imediat ce e activat. */
export function portalConnectionReady(
  portalId: string,
  connection: { status?: string | null; activated?: boolean | null } | null | undefined,
): boolean {
  if (connection?.status === "connected" || connection?.status === "ready") return true;
  return portalId === "clickimob" && connection?.activated === true;
}

export type ClickimobIndexStatusInput = {
  /** Intrarea agenției în index (calculată de `selectClickimobAgencies`), dacă există. */
  entry: { status: "active" | "grace"; inactive_since: string | null } | null;
  orgOpen: boolean;
  activated: boolean;
  selected: number;
  graceDays: number;
};

/** Eticheta stării agenției în indexul ClickImob, pentru cardul din Superadmin. */
export function clickimobIndexStatusLabel(input: ClickimobIndexStatusInput): string {
  if (input.entry?.status === "active") return "În index";
  if (input.entry?.status === "grace") {
    const since = input.entry.inactive_since ? new Date(input.entry.inactive_since) : null;
    if (since) {
      const until = new Date(since.getTime() + input.graceDays * 86_400_000);
      return `În perioada de retragere până la ${until.toLocaleDateString("ro-RO", { timeZone: "Europe/Bucharest" })}`;
    }
    return "În perioada de retragere";
  }
  if (!input.orgOpen) return "Agenție suspendată sau arhivată";
  if (!input.activated) return "Nu apare: ClickImob nu este activat";
  return "Nu apare: nicio ofertă bifată pentru ClickImob";
}
