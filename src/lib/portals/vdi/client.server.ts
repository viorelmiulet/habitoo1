/**
 * Client HTTP VDI.ro: host canonic `https://vdi.ro` (fără www, fără redirecturi),
 * cheia doar în header-ul `X-Api-Key`, JSON, timeout 15 s. Reîncercările
 * (rețea, 5xx, 429) le face coada durabilă de publicare, nu clientul.
 */
import type { PortalFail } from "../adapter";

export const VDI_BASE_URL = "https://vdi.ro";
const VDI_TIMEOUT_MS = 15_000;

export type VdiHttpOk = { ok: true; status: number; body: unknown };

export async function vdiCall(
  apiKey: string,
  endpoint: "/apioferte" | "/api",
  cat: "add" | "mod" | "del" | "list",
  body: Record<string, unknown> | null,
  query: Record<string, string> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<VdiHttpOk | PortalFail> {
  const url = new URL(endpoint, VDI_BASE_URL);
  url.searchParams.set("cat", cat);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VDI_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url.toString(), {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (response.status === 429) {
      const retry = Number(response.headers.get("retry-after"));
      return { ok: false, code: "RATE_LIMIT", message: "VDI.ro limitează temporar cererile. Reîncercăm automat.", httpStatus: 429, retryAfterMs: Number.isFinite(retry) && retry > 0 ? retry * 1000 : null, portalResponse: parsed };
    }
    if (response.status >= 500) {
      return { ok: false, code: "PORTAL_ERROR", message: `VDI.ro a răspuns cu eroare de server (${response.status}).`, httpStatus: response.status, portalResponse: parsed };
    }
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, code: "CONFIG_ERROR", message: "VDI.ro a redirecționat cererea; se folosește doar vdi.ro.", httpStatus: response.status };
    }
    if (parsed === null) {
      return { ok: false, code: "PORTAL_ERROR", message: "VDI.ro a trimis un răspuns care nu este JSON.", httpStatus: response.status };
    }
    return { ok: true, status: response.status, body: parsed };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return aborted
      ? { ok: false, code: "TIMEOUT", message: "VDI.ro nu a răspuns în 15 secunde.", httpStatus: null }
      : { ok: false, code: "NETWORK_ERROR", message: "VDI.ro nu a putut fi contactat (rețea).", httpStatus: null };
  } finally {
    clearTimeout(timer);
  }
}
