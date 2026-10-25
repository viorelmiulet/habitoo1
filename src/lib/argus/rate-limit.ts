/**
 * Limitare locală a cererilor către Argus (funcții pure, testabile).
 *
 * Limitele din documentația Argus:
 *  - /auth: 1/secundă, 1/minut, 5/oră — aplicate pe IP-ul care face cererea
 *    (serverul nostru), deci un singur contor global.
 *  - restul: 2/secundă, 60/minut, 600/oră — aplicate pe cheia API, deci pe
 *    agenție.
 *
 * Contoarele trăiesc în memoria instanței (best-effort, ca la portaluri).
 * Fiecare verificare întoarce câte milisecunde trebuie așteptat (0 = permis).
 */
export const ARGUS_AUTH_LIMITS = { perSecond: 1, perMinute: 1, perHour: 5 } as const;
export const ARGUS_API_LIMITS = { perSecond: 2, perMinute: 60, perHour: 600 } as const;

type Window = { start: number; count: number };
type Bucket = { second: Window; minute: Window; hour: Window };

const authBucket: Bucket = { second: win(0), minute: win(0), hour: win(0) };
const apiBuckets = new Map<string, Bucket>();

function win(start: number): Window {
  return { start, count: 0 };
}

function freshBucket(): Bucket {
  return { second: win(0), minute: win(0), hour: win(0) };
}

/** Avansează fereastra dacă a expirat și întoarce cât mai e până se golește. */
function waitFor(w: Window, spanMs: number, limit: number, now: number): number {
  if (now - w.start >= spanMs) {
    w.start = now;
    w.count = 0;
  }
  if (w.count < limit) return 0;
  return spanMs - (now - w.start);
}

function check(
  bucket: Bucket,
  limits: { perSecond: number; perMinute: number; perHour: number },
  now: number,
): number {
  const wait = Math.max(
    waitFor(bucket.second, 1_000, limits.perSecond, now),
    waitFor(bucket.minute, 60_000, limits.perMinute, now),
    waitFor(bucket.hour, 3_600_000, limits.perHour, now),
  );
  if (wait === 0) {
    bucket.second.count += 1;
    bucket.minute.count += 1;
    bucket.hour.count += 1;
  }
  return wait;
}

/**
 * Verifică limita pentru /auth (globală, pe IP-ul serverului).
 * Întoarce ms de așteptat; 0 înseamnă că cererea e permisă și a fost numărată.
 */
export function argusAuthThrottle(now = Date.now()): number {
  return check(authBucket, ARGUS_AUTH_LIMITS, now);
}

/** Verifică limita pentru celelalte endpointuri, pe agenție (cheie API). */
export function argusApiThrottle(organizationId: string, now = Date.now()): number {
  let bucket = apiBuckets.get(organizationId);
  if (!bucket) {
    bucket = freshBucket();
    apiBuckets.set(organizationId, bucket);
  }
  return check(bucket, ARGUS_API_LIMITS, now);
}

/** Doar pentru teste: golește toate contoarele. */
export function resetArgusThrottles(): void {
  authBucket.second = win(0);
  authBucket.minute = win(0);
  authBucket.hour = win(0);
  apiBuckets.clear();
}
