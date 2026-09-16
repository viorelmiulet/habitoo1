/**
 * Modelul credențialelor Imobiliare.ro (funcții pure).
 *
 * Agenția introduce o singură dată utilizator + parolă. După prima autorizare
 * păstrăm DOAR tokenurile (access + refresh) și data de expirare, criptate în
 * `portal_connections.portal_credentials_encrypted`. Parola nu se mai
 * folosește și nu se mai stochează.
 */
import { IMOBILIARE_REFRESH_MARGIN_MS, IMOBILIARE_TOKEN_TTL_SECONDS } from "./config";

export type ImobiliareTokens = {
  kind: "tokens";
  username: string | null;
  accessToken: string;
  refreshToken: string | null;
  /** ISO 8601. */
  expiresAt: string | null;
};

export type ImobiliarePassword = { kind: "password"; password: string };

export type ImobiliareCredential = ImobiliareTokens | ImobiliarePassword | null;

/** Recunoaște un pachet de tokenuri salvat; altfel tratează textul ca parolă. */
export function parseImobiliareCredential(raw: string | null): ImobiliareCredential {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      const accessToken = typeof parsed["access_token"] === "string" ? parsed["access_token"] : "";
      if (accessToken) {
        return {
          kind: "tokens",
          username: typeof parsed["username"] === "string" ? parsed["username"] : null,
          accessToken,
          refreshToken:
            typeof parsed["refresh_token"] === "string" ? parsed["refresh_token"] : null,
          expiresAt: typeof parsed["expires_at"] === "string" ? parsed["expires_at"] : null,
        };
      }
    } catch {
      // Text care doar începe cu „{”: îl tratăm ca parolă, fără să eșuăm.
    }
  }
  return { kind: "password", password: value };
}

export function encodeImobiliareTokens(input: {
  username: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}): string {
  return JSON.stringify({
    username: input.username,
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    expires_at: input.expiresAt,
  });
}

/** Data de expirare pornind de la `expires_in` (implicit 31 de zile). */
export function expiresAtFrom(expiresIn: unknown, now = Date.now()): string {
  const seconds =
    typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0
      ? expiresIn
      : IMOBILIARE_TOKEN_TTL_SECONDS;
  return new Date(now + seconds * 1000).toISOString();
}

/** Reînnoim dacă mai sunt sub 3 zile din valabilitate (sau nu știm expirarea). */
export function needsImobiliareRefresh(tokens: ImobiliareTokens, now = Date.now()): boolean {
  if (!tokens.expiresAt) return true;
  const expiresAt = Date.parse(tokens.expiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt - now <= IMOBILIARE_REFRESH_MARGIN_MS;
}

/** Extrage tokenurile din răspunsul portalului, fără să presupună forma. */
export function tokensFromResponse(
  body: unknown,
  fallbackRefresh: string | null,
  now = Date.now(),
): { accessToken: string; refreshToken: string | null; expiresAt: string } | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const nested = (root["data"] ?? root["token"] ?? root) as Record<string, unknown>;
  const accessToken =
    typeof nested["access_token"] === "string"
      ? nested["access_token"]
      : typeof root["access_token"] === "string"
        ? root["access_token"]
        : "";
  if (!accessToken) return null;
  const refreshToken =
    typeof nested["refresh_token"] === "string"
      ? nested["refresh_token"]
      : typeof root["refresh_token"] === "string"
        ? (root["refresh_token"] as string)
        : fallbackRefresh;
  return {
    accessToken,
    refreshToken: refreshToken ?? null,
    expiresAt: expiresAtFrom(nested["expires_in"] ?? root["expires_in"], now),
  };
}
