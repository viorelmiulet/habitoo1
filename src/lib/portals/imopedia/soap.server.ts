/** Client SOAP Imopedia (server-only): login, viewAgency, logout. Timeout 30 s per cerere. */
import {
  IMOPEDIA_SOAP_ENDPOINT,
  ImopediaSoapError,
  buildLoginEnvelope,
  buildLogoutEnvelope,
  buildViewAgencyEnvelope,
  parseSoapResponse,
  readImopediaResult,
  soapActionFor,
  type ImopediaResult,
} from "./soap";

export * from "./soap";

export const IMOPEDIA_TIMEOUT_MS = 30_000;

export type ImopediaFetch = (url: string, init: RequestInit) => Promise<Response>;
export type ImopediaRawLog = { operation: string; status: number | null; xml: string };

export type ImopediaClientDeps = {
  fetch?: ImopediaFetch;
  timeoutMs?: number;
  /** Primește XML-ul brut al fiecărui răspuns (de redactat înainte de jurnalizare). */
  onResponse?: (entry: ImopediaRawLog) => void;
};

async function call(operation: string, body: string, deps: ImopediaClientDeps): Promise<unknown> {
  const doFetch = deps.fetch ?? ((u, i) => fetch(u, i));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? IMOPEDIA_TIMEOUT_MS);
  let res: Response;
  try {
    res = await doFetch(IMOPEDIA_SOAP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: soapActionFor(operation),
        "User-Agent": "Habitoo CRM (+https://habitoo.ro)",
      },
      body,
      signal: controller.signal,
      redirect: "error",
    });
  } catch (error) {
    if (controller.signal.aborted) throw new ImopediaSoapError("TIMEOUT", "Imopedia nu a răspuns în 30 de secunde.");
    throw new ImopediaSoapError("NETWORK_ERROR", error instanceof Error ? error.message : "Eroare de rețea Imopedia.");
  } finally {
    clearTimeout(timer);
  }
  const xml = await res.text();
  deps.onResponse?.({ operation, status: res.status, xml });
  // SOAP 1.1 întoarce Fault cu HTTP 500: parsăm înainte să tratăm statusul.
  if (/<(?:[\w-]+:)?Fault\b/.test(xml)) return parseSoapResponse(xml);
  if (!res.ok) throw new ImopediaSoapError("HTTP_ERROR", `Imopedia a răspuns cu HTTP ${res.status}.`, null, res.status);
  return parseSoapResponse(xml);
}

export async function imopediaLogin(username: string, password: string, deps: ImopediaClientDeps = {}): Promise<string> {
  const value = await call("login", buildLoginEnvelope(username, password), deps);
  const sessionId =
    typeof value === "string" || typeof value === "number"
      ? String(value).trim()
      : value && typeof value === "object"
        ? String((value as Record<string, unknown>)["session_id"] ?? "").trim()
        : "";
  if (!sessionId) throw new ImopediaSoapError("PARSE_ERROR", "Imopedia nu a întors un session_id.");
  return sessionId;
}

export async function imopediaViewAgency(sessionId: string, agencyId: number, deps: ImopediaClientDeps = {}): Promise<ImopediaResult> {
  return readImopediaResult(await call("viewAgency", buildViewAgencyEnvelope(sessionId, agencyId), deps));
}

export async function imopediaLogout(sessionId: string, deps: ImopediaClientDeps = {}): Promise<void> {
  await call("logout", buildLogoutEnvelope(sessionId), deps);
}
