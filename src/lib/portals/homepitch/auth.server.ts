/**
 * Autentificarea endpointurilor HomePitch.
 *
 * HomePitch poate trimite cheia API emisă de Habitoo în oricare din trei forme:
 *   - `Authorization: <KEY>` (fără schema Bearer)
 *   - `X-Api-Key: <KEY>`
 *   - `?api_key=<KEY>`
 *
 * Normalizăm cererea într-un `Authorization: Bearer <KEY>` și reutilizăm exact
 * mecanismul existent (`portal_api_keys`, rate limit, logare), fără o a doua
 * implementare de verificare a cheilor.
 */
import { withFeedAuth, type FeedAuthOk } from "@/lib/site-feed/auth.server";

export const HOMEPITCH_API_VERSION = "habitoo-homepitch/1.0";
export const HOMEPITCH_BASE_PATH = "/api/public/homepitch/v1";

export function readHomePitchKey(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const trimmed = header.trim();
    const match = /^bearer\s+(.+)$/i.exec(trimmed);
    const value = (match?.[1] ?? trimmed).trim();
    if (value) return value;
  }
  const apiKeyHeader = request.headers.get("x-api-key")?.trim();
  if (apiKeyHeader) return apiKeyHeader;
  const fromQuery = new URL(request.url).searchParams.get("api_key")?.trim();
  return fromQuery || null;
}

/** Wrapper comun: normalizează cheia, apoi refolosește `withFeedAuth`. */
export async function withHomePitchAuth(
  request: Request,
  endpoint: string,
  handler: (auth: FeedAuthOk) => Promise<{ response: Response; items?: number }>,
): Promise<Response> {
  const key = readHomePitchKey(request);
  const normalized = key
    ? new Request(request.url, {
        method: request.method,
        headers: { authorization: `Bearer ${key}` },
      })
    : request;
  return withFeedAuth(normalized, endpoint, handler);
}
