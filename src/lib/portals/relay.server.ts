/**
 * Releu cu IP fix pentru portalurile care acceptă doar IP-uri aprobate
 * (VDI.ro, Imobiliare.ro). Adresa releului este `https://relay.habitoo.ro`
 * (secretul opțional `PORTAL_RELAY_URL` o poate înlocui); cheia
 * `PORTAL_RELAY_KEY` rămâne obligatorie — fără ea cererea pleacă direct.
 * Cheia nu apare niciodată în loguri sau mesaje de eroare.
 */
export type RelayPortal = "vdi" | "imobiliare";
import { withPortalDeadline } from "./publication-resilience";

const PORTAL_HOSTS: Record<RelayPortal, string> = {
  vdi: "vdi.ro",
  imobiliare: "www.imobiliare.ro",
};

/** Adresa releului cu IP fix, folosită când `PORTAL_RELAY_URL` nu e setat. */
export const RELAY_DEFAULT_URL = "https://relay.habitoo.ro";

type RelayEnv = { url?: string; key?: string };

function readRelayEnv(): RelayEnv {
  return { url: process.env["PORTAL_RELAY_URL"], key: process.env["PORTAL_RELAY_KEY"] };
}

/** Adresa efectivă a releului: secretul `PORTAL_RELAY_URL` sau valoarea implicită. */
export function relayUrlOf(env: RelayEnv = readRelayEnv()): string {
  return (env.url?.trim() || RELAY_DEFAULT_URL).replace(/\/+$/, "");
}

export function relayConfigured(env: RelayEnv = readRelayEnv()): boolean {
  return Boolean(env.key?.trim());
}

/** Rescrie adresa portalului către releu; `null` dacă hostul nu e al portalului. */
export function rewriteForRelay(portal: RelayPortal, url: string, relayUrl: string): string | null {
  const target = new URL(url);
  if (target.hostname !== PORTAL_HOSTS[portal]) return null;
  const base = relayUrl.replace(/\/+$/, "");
  return `${base}/${portal}${target.pathname}${target.search}`;
}

export function stripRelayKey(text: string, key: string | undefined = readRelayEnv().key): string {
  return key ? text.split(key).join("[ascuns]") : text;
}

export async function relayFetch(
  portal: RelayPortal,
  url: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
  env: RelayEnv = readRelayEnv(),
): Promise<Response> {
  if (!relayConfigured(env)) return fetchImpl(url, init);
  const rewritten = rewriteForRelay(portal, url, relayUrlOf(env));
  if (!rewritten) return fetchImpl(url, init);
  const headers = new Headers(init.headers);
  const key = env.key?.trim();
  if (!key) return fetchImpl(url, init);
  headers.set("X-Relay-Key", key);
  try {
    const response = await withPortalDeadline(async (signal) => {
      const response = await fetchImpl(rewritten, { ...init, headers, signal });
      const body = await response.arrayBuffer();
      return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : body, {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    });
    if (fetchImpl === fetch) {
      const { recordRelayResponse } = await import("./relay-health.server");
      await recordRelayResponse(true);
    }
    return response;
  } catch (error) {
    if (fetchImpl === fetch && error instanceof Error && (error.name === "AbortError" || /refused|fetch failed|network|connection|failed to fetch/i.test(error.message))) {
      const { recordRelayResponse } = await import("./relay-health.server");
      await recordRelayResponse(false);
    }
    if (error instanceof Error) {
      const safe = new Error(stripRelayKey(error.message, env.key));
      safe.name = error.name;
      throw safe;
    }
    throw new Error("Releul portalurilor nu a putut fi contactat.");
  }
}

export const vdiRelayFetch: typeof fetch = (input, init) =>
  relayFetch("vdi", String(input instanceof Request ? input.url : input), init);

export type RelayIpCheck =
  | { ok: true; ip: string; expected: boolean }
  | { ok: false; reason: "not_configured" | "forbidden" | "unreachable" | "error"; message: string };

export const RELAY_EXPECTED_IP = "185.166.212.65";

export async function checkRelayIp(
  fetchImpl: typeof fetch = fetch,
  env: RelayEnv = readRelayEnv(),
): Promise<RelayIpCheck> {
  if (!relayConfigured(env)) {
    return { ok: false, reason: "not_configured", message: "Releul nu este configurat (lipsește cheia de acces)." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(`${relayUrlOf(env)}/ipcheck/`, {
      method: "GET",
       headers: { "X-Relay-Key": env.key?.trim() ?? "" },
      signal: controller.signal,
    });
    if (response.status === 403) {
      return { ok: false, reason: "forbidden", message: "Releul a refuzat cheia (403). Verifică PORTAL_RELAY_KEY." };
    }
    if (!response.ok) {
      return { ok: false, reason: "error", message: `Releul a răspuns cu eroarea ${response.status}.` };
    }
    const ip = (await response.text()).trim().slice(0, 64);
    return { ok: true, ip, expected: ip === RELAY_EXPECTED_IP };
  } catch {
    return { ok: false, reason: "unreachable", message: "Releul nu răspunde. Verifică adresa sau serverul releului." };
  } finally {
    clearTimeout(timer);
  }
}
