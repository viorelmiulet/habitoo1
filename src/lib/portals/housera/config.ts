/** Housera.ro: configurare de platformă (pură, fără secrete în cod). */
export type HouseraEnv = "staging" | "production";

export const HOUSERA_CALLBACK = "https://crm.habitoo.ro/api/public/portal/v1/housera/oauth/callback";
export const HOUSERA_TIMEOUT_MS = 30_000;
export const HOUSERA_MISSING_MESSAGE = "Integrarea Housera nu este configurată la nivel de platformă";
export const HOUSERA_RECONNECT_MESSAGE =
  "Conexiunea Housera a expirat sau a fost revocată. Reconectează agenția.";
export const HOUSERA_TEST_OK_MESSAGE = "Cheie validă · contul Housera răspunde";

type Env = Record<string, string | undefined>;

/** Implicit `staging`; doar valoarea exactă `production` activează producția. */
export function houseraEnv(env: Env): HouseraEnv {
  return env["HOUSERA_ENV"]?.trim().toLowerCase() === "production" ? "production" : "staging";
}

export function houseraBaseUrl(env: Env): string {
  return houseraEnv(env) === "production" ? "https://housera.ro/api/v1/" : "https://staging.housera.ro/api/v1/";
}

export function houseraConsentUrl(env: Env): string {
  return houseraEnv(env) === "production"
    ? "https://housera.ro/setari/api/conectare"
    : "https://staging.housera.ro/setari/api/conectare";
}

export function houseraConfigured(env: Env): boolean {
  return Boolean(env["HOUSERA_CLIENT_ID"]?.trim() && env["HOUSERA_CLIENT_SECRET"]?.trim());
}

/** Cheia completă: `<id>|hsr_test_…` (sandbox) sau `<id>|hsr_live_…` (producție). */
const KEY = /^\d+\|hsr_(test|live)_[A-Za-z0-9_-]{8,}$/;
export function houseraKeyMode(key: string): "test" | "live" | null {
  const m = KEY.exec(key.trim());
  return m ? (m[1] as "test" | "live") : null;
}

export const HOUSERA_APPROVAL_NOTE =
  "Aprobarea trebuie dată de titularul sau de un administrator al agenției în Housera; altfel conexiunea vede doar anunțurile celui care aprobă.";
export const HOUSERA_DISCONNECT_NOTE =
  "Deconectarea șterge cheia din Habitoo. Revocarea completă se face în Housera, din Setări → API → Aplicații conectate.";

/** Avertisment „Reconectează Housera” cu 14 zile înainte de expirare. */
export function houseraExpiresSoon(expiresAt: string | null | undefined, nowMs: number): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t - nowMs <= 14 * 86_400_000;
}

export type HouseraOAuthInfo = { connectedAt: string | null; expiresAt: string | null; scopes: string[] };
export function houseraOAuthInfo(settings: unknown): HouseraOAuthInfo | null {
  const o = settings && typeof settings === "object" ? (settings as Record<string, unknown>)["oauth"] : null;
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  return {
    connectedAt: typeof r["connected_at"] === "string" ? r["connected_at"] : null,
    expiresAt: typeof r["expires_at"] === "string" ? r["expires_at"] : null,
    scopes: Array.isArray(r["scopes"]) ? r["scopes"].filter((s): s is string => typeof s === "string") : [],
  };
}

/** Doar ultimele 4 caractere sunt vizibile. */
export function maskHouseraKey(key: string | null | undefined): string | null {
  const k = key?.trim();
  if (!k) return null;
  return `••••${k.length > 4 ? k.slice(-4) : ""}`;
}
