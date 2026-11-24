/**
 * Client HomeZZ.ro (xmlimport): doar POST la `https://homezz.ro/xmlimport/{acțiune}`,
 * `redirect: "manual"`, corp `application/x-www-form-urlencoded`. Transportul e
 * injectat (în producție `relayFetch("homezz", …)`). `key`/`token` nu apar
 * niciodată în mesaje sau în răspunsul jurnalizat. Fără reîncercare la 403.
 */
export const HOMEZZ_BASE_URL = "https://homezz.ro/xmlimport";
export const HOMEZZ_RAW_LIMIT_BYTES = 20 * 1024;
const TIMEOUT_MS = 20_000;

export type HomezzScalar = string | number | boolean | null | undefined;
export type HomezzValue = HomezzScalar | HomezzScalar[] | Record<string, HomezzScalar>;
export type HomezzParams = Record<string, HomezzValue>;

export type HomezzTransport = (url: string, init: RequestInit) => Promise<Response>;

export type HomezzFailKind = "action_error" | "forbidden" | "redirect" | "server_error" | "http_error" | "invalid_response" | "timeout" | "network_error";

export type HomezzResult =
  | { ok: true; status: number; message: string; data: unknown; raw: string }
  | { ok: false; kind: HomezzFailKind; status: number | null; message: string; adError: string | null; retryable: boolean; raw: string };

/**
 * Singurul loc care codează corpul. Vectorii devin `nume[index]=valoare`
 * (`images[0]=…`, `promotions[3]=5`). Valorile null/undefined se omit.
 */
export function encodeHomezzForm(params: HomezzParams): string {
  const body = new URLSearchParams();
  const put = (name: string, v: HomezzScalar) => {
    if (v === null || v === undefined) return;
    body.append(name, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  };
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v, i) => put(`${name}[${i}]`, v));
    else if (value !== null && typeof value === "object") for (const [k, v] of Object.entries(value)) put(`${name}[${k}]`, v);
    else put(name, value);
  }
  return body.toString();
}

/** Înlocuiește valorile secrete (și formele lor codate) cu `[ascuns]`. */
export function redactHomezz(text: string, secrets: (string | null | undefined)[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s) continue;
    for (const form of new Set([s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1)])) out = out.split(form).join("[ascuns]");
  }
  return out.replace(/("(?:key|token)"\s*:\s*")[^"]*"/gi, '$1[ascuns]"').replace(/\b(key|token)=[^&\s"]*/gi, "$1=[ascuns]");
}

export function truncateHomezzRaw(text: string, limit = HOMEZZ_RAW_LIMIT_BYTES): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= limit) return text;
  return `${new TextDecoder().decode(bytes.slice(0, limit)).replace(/\uFFFD$/, "")}…[trunchiat]`;
}

type Envelope = { meta?: { code?: unknown; message?: unknown }; data?: unknown };

/** Interpretează răspunsul: 200 succes, 400 eroare la acțiune, 403 parametri incorecți. */
export function interpretHomezzResponse(httpStatus: number, bodyText: string, secrets: (string | null | undefined)[] = []): HomezzResult {
  const raw = truncateHomezzRaw(redactHomezz(bodyText, secrets));
  const clean = (t: string) => redactHomezz(t, secrets);
  if (httpStatus >= 300 && httpStatus < 400) {
    return { ok: false, kind: "redirect", status: httpStatus, message: `HomeZZ a răspuns cu redirecționare (${httpStatus}); cererea nu a fost urmată.`, adError: null, retryable: false, raw };
  }
  let env: Envelope | null = null;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (parsed && typeof parsed === "object") env = parsed as Envelope;
  } catch {
    env = null;
  }
  const metaCode = typeof env?.meta?.code === "number" ? env.meta.code : Number(env?.meta?.code);
  const code = Number.isFinite(metaCode) && metaCode > 0 ? metaCode : httpStatus;
  const metaMessage = typeof env?.meta?.message === "string" ? clean(env.meta.message) : "";
  const data = env?.data;
  const adErrorRaw = data && typeof data === "object" ? (data as Record<string, unknown>)["ad_error"] : undefined;
  const adError = adErrorRaw === undefined || adErrorRaw === null ? null : clean(typeof adErrorRaw === "string" ? adErrorRaw : JSON.stringify(adErrorRaw));
  const exact = [metaMessage, adError].filter(Boolean).join(" — ");

  if (httpStatus >= 500) {
    return { ok: false, kind: "server_error", status: httpStatus, message: exact || `HomeZZ a răspuns cu eroarea ${httpStatus}.`, adError, retryable: true, raw };
  }
  if (!env || !env.meta) {
    return { ok: false, kind: "invalid_response", status: httpStatus, message: `Răspuns HomeZZ neașteptat (HTTP ${httpStatus}).`, adError: null, retryable: false, raw };
  }
  if (code === 200 && httpStatus >= 200 && httpStatus < 300) {
    return { ok: true, status: 200, message: metaMessage, data: data ?? null, raw };
  }
  if (code === 403 || httpStatus === 403) {
    return { ok: false, kind: "forbidden", status: 403, message: exact || "HomeZZ: parametri incorecți (403).", adError, retryable: false, raw };
  }
  if (code === 400 || httpStatus === 400) {
    return { ok: false, kind: "action_error", status: 400, message: exact || "HomeZZ: eroare la acțiune (400).", adError, retryable: false, raw };
  }
  return { ok: false, kind: "http_error", status: code, message: exact || `HomeZZ a răspuns cu codul ${code}.`, adError, retryable: false, raw };
}

/** POST la o acțiune xmlimport. Fără reîncercare: apelantul decide (niciodată la 403). */
export async function homezzPost(action: string, params: HomezzParams, transport: HomezzTransport): Promise<HomezzResult> {
  if (!/^[a-z0-9-]+$/i.test(action)) throw new Error("Acțiune HomeZZ invalidă.");
  const secrets = [params["key"], params["token"]].filter((v): v is string => typeof v === "string");
  try {
    const response = await transport(`${HOMEZZ_BASE_URL}/${action}`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8", Accept: "application/json" },
      body: encodeHomezzForm(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return interpretHomezzResponse(response.status, await response.text(), secrets);
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const timeout = name === "TimeoutError" || name === "AbortError";
    const message = timeout
      ? "HomeZZ nu a răspuns la timp."
      : `HomeZZ nu a putut fi contactat: ${redactHomezz(error instanceof Error ? error.message : String(error), secrets)}`;
    return { ok: false, kind: timeout ? "timeout" : "network_error", status: null, message, adError: null, retryable: true, raw: "" };
  }
}

const PATTERNS: [string, RegExp][] = [
  ["Perioadă", /perio|start|end|valid|expir|from|until|contract|date/i],
  ["Sloturi", /slot|limit|ads|anunt/i],
  ["Promovări", /promo/i],
];

/** Rezumat al contractului din `details-agency` (forma `data` nu e documentată). */
export function describeHomezzAgency(data: unknown): string {
  const found: Record<string, string[]> = {};
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > 3 || value === null || value === undefined) return;
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (/^(key|token|password|secret)$/i.test(k)) continue;
        walk(v, path ? `${path}.${k}` : k, depth + 1);
      }
      return;
    }
    const label = PATTERNS.find(([, re]) => re.test(path))?.[0];
    if (label) (found[label] ??= []).push(`${path}=${String(value).slice(0, 80)}`);
  };
  walk(data, "", 0);
  const parts = PATTERNS.map(([label]) => found[label]?.length ? `${label}: ${found[label]!.slice(0, 6).join(", ")}` : null).filter(Boolean);
  return parts.length ? `Conectat la HomeZZ.ro. ${parts.join("; ")}.` : "Conectat la HomeZZ.ro.";
}
