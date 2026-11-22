export type ImmofluxConnectionView = { organizationId: string; host: string; slug: string; enabled: boolean; configured: boolean };

export function normalizeImmofluxHost(raw: string): string {
  let url: URL;
  try { url = new URL(raw.includes("://") ? raw.trim() : `https://${raw.trim()}`); }
  catch { throw new Error("Host IMMOFLUX invalid."); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*immoflux\.ro$/.test(host)) {
    throw new Error("Hostul trebuie să fie immoflux.ro sau un subdomeniu IMMOFLUX, fără cale sau port.");
  }
  return host;
}

export function normalizeImmofluxSlug(raw: string): string {
  const slug = raw.trim();
  if (!/^[a-zA-Z0-9_-]{1,150}$/.test(slug)) throw new Error("Slug invalid: folosește litere, cifre, cratimă sau underscore.");
  return slug;
}

export async function testImmofluxPull(host: string, slug: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; message: string; httpStatus: number | null; total: number | null }> {
  const url = `https://${normalizeImmofluxHost(host)}/api/bridges/portal/${normalizeImmofluxSlug(slug)}/properties?page=1`;
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "X-API-Key": apiKey, Accept: "application/json" } });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, httpStatus: response.status, total: null, message: response.status === 401 ? "Cheie API invalidă (HTTP 401)." : response.status === 404 ? "Portal sau slug greșit (HTTP 404)." : `Conexiune nereușită: HTTP ${response.status}.` };
    }
    // Never return provider data or errors: only the documented aggregate.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("empty");
    const decoder = new TextDecoder();
    let bytes = 0; let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("oversize"); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    const total = body && typeof body === "object" && "total" in body ? body.total : null;
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) return { ok: false, message: "Răspuns IMMOFLUX invalid: lipsește totalul anunțurilor.", httpStatus: response.status, total: null };
    return { ok: true, message: `OK, ${total} anunțuri disponibile`, httpStatus: response.status, total };
  } catch {
    return { ok: false, message: "Conexiunea nu a răspuns în timp util sau răspunsul este invalid.", httpStatus: null, total: null };
  }
}