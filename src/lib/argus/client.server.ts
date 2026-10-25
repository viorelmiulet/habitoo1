/**
 * Clientul HTTP Argus (server-only). Fetch-ul este injectabil, ca testele să
 * ruleze fără apeluri reale.
 *
 * Autentificare: POST /v2.1/auth cu {"api_key": ...} și headerul `Application`
 * (tokenul de aplicație Habitoo). Răspunsul e o listă cu un singur obiect
 * { authorization_token }; tokenul se trimite apoi în headerul `Authorization`.
 *
 * Reguli: 429 → așteaptă `Retry-After` (sau 1s) și reîncearcă o singură dată;
 * 403 → cotă lunară depășită; 401 → semnalizează reautentificare (o dată, la
 * nivelul apelantului). Cheia și tokenul nu se loghează și nu se returnează.
 */
import { ArgusError, ARGUS_QUOTA_MESSAGE } from "./errors";

export const ARGUS_API_BASE = "https://api.argus.me/v2.1";
const REQUEST_TIMEOUT_MS = 20_000;

export type ArgusFetch = typeof fetch;
export type ArgusSleep = (ms: number) => Promise<void>;
const defaultSleep: ArgusSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tokenul de aplicație Habitoo, citit din secretul de proiect. */
export function argusApplicationToken(): string {
  const token = process.env["ARGUS_APPLICATION_TOKEN"];
  if (!token || !token.trim()) {
    throw new ArgusError(
      "config",
      "Integrarea Argus nu este configurată încă pe platformă. Revino mai târziu.",
    );
  }
  return token.trim();
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

function retryAfterMs(res: Response): number {
  const raw = res.headers.get("retry-after");
  if (!raw) return 1_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000);
  return 1_000;
}

/** Clasifică un răspuns de eroare Argus într-o eroare sigură de afișat. */
function classifyStatus(status: number, authEndpoint: boolean): ArgusError {
  if (status === 401) {
    return new ArgusError(
      "auth",
      authEndpoint
        ? "Cheia API Argus a fost refuzată. Verifică cheia și reia."
        : "Sesiunea Argus a expirat. Se reautentifică.",
      status,
    );
  }
  if (status === 403) return new ArgusError("quota", `${ARGUS_QUOTA_MESSAGE}.`, status);
  if (status === 429) {
    return new ArgusError(
      "rate_limit",
      "Argus a limitat temporar cererile. Se reia după intervalul cerut.",
      status,
    );
  }
  if (status >= 500) {
    return new ArgusError("network", "Argus a returnat o eroare temporară. Încearcă din nou.", status);
  }
  return new ArgusError("rejected", `Argus a respins cererea (HTTP ${status}).`, status);
}

/**
 * Autentificare la Argus cu cheia API a agenției. Întoarce tokenul de
 * autorizare (valabil 24h de la ultima cerere; se reface doar la 401).
 */
export async function argusAuthenticate(
  apiKey: string,
  f: ArgusFetch = fetch,
  applicationToken: string = argusApplicationToken(),
): Promise<string> {
  let res: Response;
  try {
    res = await f(`${ARGUS_API_BASE}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Application: applicationToken },
      body: JSON.stringify({ api_key: apiKey }),
      signal: timeoutSignal(),
    });
  } catch {
    throw new ArgusError("network", "Argus nu a putut fi contactat. Încearcă din nou.");
  }
  if (!res.ok) throw classifyStatus(res.status, true);
  const body = await readJson(res);
  const first = Array.isArray(body) ? body[0] : body;
  const token =
    first && typeof first === "object"
      ? (first as Record<string, unknown>)["authorization_token"]
      : null;
  if (typeof token !== "string" || !token) {
    throw new ArgusError("rejected", "Argus nu a returnat un token de autorizare valid.");
  }
  return token;
}

export type ArgusRequestOptions = {
  token: string;
  /** Calea relativă, ex. `/properties/search`. */
  path: string;
  method?: "GET" | "POST";
  /** Corpul cererii POST (obiect simplu). */
  body?: Record<string, unknown>;
  /** IP-ul utilizatorului care vede rezultatele; se trimite ca `client_ip`. */
  clientIp?: string | null;
  fetchFn?: ArgusFetch;
  sleep?: ArgusSleep;
};

/**
 * Cerere autentificată către Argus. La 429 așteaptă și reîncearcă o dată;
 * la 401 aruncă ArgusError("auth") — apelantul reautentifică și reia o dată.
 */
export async function argusRequest<T = unknown>(opts: ArgusRequestOptions): Promise<T> {
  const f = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const method = opts.method ?? "POST";

  const build = (): { url: string; init: RequestInit } => {
    const headers: Record<string, string> = { Authorization: opts.token };
    if (method === "GET") {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.body ?? {})) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
      if (opts.clientIp) params.set("client_ip", opts.clientIp);
      const qs = params.toString();
      return {
        url: `${ARGUS_API_BASE}${opts.path}${qs ? `?${qs}` : ""}`,
        init: { method, headers, signal: timeoutSignal() },
      };
    }
    headers["Content-Type"] = "application/json";
    const payload: Record<string, unknown> = { ...(opts.body ?? {}) };
    if (opts.clientIp) payload["client_ip"] = opts.clientIp;
    return {
      url: `${ARGUS_API_BASE}${opts.path}`,
      init: { method, headers, body: JSON.stringify(payload), signal: timeoutSignal() },
    };
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { url, init } = build();
    let res: Response;
    try {
      res = await f(url, init);
    } catch {
      throw new ArgusError("network", "Argus nu a putut fi contactat. Încearcă din nou.");
    }
    if (res.status === 429 && attempt === 1) {
      await sleep(retryAfterMs(res));
      continue;
    }
    if (!res.ok) throw classifyStatus(res.status, false);
    return (await readJson(res)) as T;
  }
  throw new ArgusError("rate_limit", "Argus a limitat temporar cererile. Încearcă din nou.", 429);
}
