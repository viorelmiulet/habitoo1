/**
 * Citirea stării contului Imobiliare.ro, cu memorare scurtă per organizație.
 *
 * `GET /api/v3/me` nu se schimbă des (abonament, tip, număr de anunțuri
 * online), deci NU se cere la fiecare încărcare de pagină: rezultatul se
 * păstrează 10 minute în memoria procesului.
 */
import { IMOBILIARE_PATHS } from "./config";
import { imobiliareAuthedRequest, type ImobiliareSession } from "./auth.server";
import { parseImobiliareAccount, type ImobiliareAccountState } from "./account";

export const IMOBILIARE_ACCOUNT_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { at: number; value: ImobiliareAccountState | null }>();

export function clearImobiliareAccountCache() {
  cache.clear();
}

/** `null` = portalul nu a răspuns; apelantul NU trage nicio concluzie. */
export async function fetchImobiliareAccount(
  session: ImobiliareSession,
  organizationId: string,
  now = Date.now(),
): Promise<ImobiliareAccountState | null> {
  const hit = cache.get(organizationId);
  if (hit && now - hit.at < IMOBILIARE_ACCOUNT_TTL_MS) return hit.value;

  let value: ImobiliareAccountState | null = null;
  try {
    const response = await imobiliareAuthedRequest(session, {
      method: "GET",
      path: IMOBILIARE_PATHS.me,
      connectionKey: organizationId,
    });
    value = response.ok ? parseImobiliareAccount(response.body) : null;
  } catch {
    value = null;
  }
  cache.set(organizationId, { at: now, value });
  return value;
}
