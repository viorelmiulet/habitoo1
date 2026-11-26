import type { PortalContext, PortalResult } from '../adapter';
import { codeFromHttpStatus, PORTAL_ERROR_MESSAGE, toPortalError } from '../errors';

export const MVA_API_BASE = 'https://www.mvaimobiliare.ro/api/public/habitoo/v1';
export const MVA_TIMEOUT_MS = 20_000;
/** Never persist provider bodies: even a field error can echo the credential. */
function safeText(value: unknown, key: string): string {
  const text = Array.isArray(value) ? value.map(v => typeof v === 'string' ? v : 'invalid').join(', ') : typeof value === 'string' ? value : 'invalid';
  return text.split(key).join('[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 300);
}
export async function mvaRequest<T>(ctx: PortalContext, method: 'GET' | 'PUT' | 'DELETE', path: string, payload?: unknown): Promise<PortalResult<T>> {
  const key = ctx.portalCredential?.trim();
  if (!key) return { ok: false, code: 'CONFIG_ERROR', message: 'Cheia API mvaimobiliare.ro nu este salvată pentru această agenție.' };
  if (!ctx.allowLiveRequests) return { ok: false, code: 'CONFIG_ERROR', message: 'Apelurile către mvaimobiliare.ro sunt oprite.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MVA_TIMEOUT_MS);
  try {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    if (body && new TextEncoder().encode(body).length > 1_000_000) return { ok: false, code: 'VALIDATION_ERROR', httpStatus: 413, message: 'mvaimobiliare.ro: anunțul depășește limita de 1 MB.' };
    const response = await fetch(`${MVA_API_BASE}${path}`, {
      method, redirect: 'manual', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body }),
    });
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, data: await response.json() as T };
    }
    let message: string;
    let code = codeFromHttpStatus(response.status);
    if (response.status === 401 || response.status === 403) message = 'mvaimobiliare.ro a refuzat cheia API. Verifică cheia salvată pentru agenție.';
    else if (response.status === 422) {
      code = 'VALIDATION_ERROR';
      const data = await response.json().catch(() => null) as { fields?: unknown } | null;
      const fields = data?.fields;
      const errors = fields && typeof fields === 'object' && !Array.isArray(fields)
        ? Object.entries(fields).map(([field, value]) => `${safeText(field, key)}: ${safeText(value, key)}`).join(' • ').slice(0, 1500) : '';
      message = `mvaimobiliare.ro a respins datele anunțului.${errors ? ` ${errors}` : ''}`;
    } else if (response.status === 413) { code = 'VALIDATION_ERROR'; message = 'mvaimobiliare.ro: anunțul depășește limita de 1 MB.'; }
    else message = `mvaimobiliare.ro: ${PORTAL_ERROR_MESSAGE[code]} (HTTP ${response.status}).`;
    const retry = Number(response.headers.get('retry-after'));
    return { ok: false, code, message, httpStatus: response.status, ...(response.status === 429 && retry > 0 ? { retryAfterMs: retry * 1000 } : {}) };
  } catch (error) {
    const normalized = toPortalError(error);
    return { ok: false, code: normalized.code, message: `mvaimobiliare.ro: ${normalized.message}` };
  } finally { clearTimeout(timer); }
}
