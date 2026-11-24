/**
 * Lucru care continuă după trimiterea răspunsului HTTP.
 *
 * `src/server.ts` rulează fiecare cerere în contextul de mai jos, cu `ctx`-ul
 * runtime-ului (care expune `waitUntil`). Fără `waitUntil` (de exemplu în
 * dezvoltare), promisiunea rulează oricum în fundal, fără să întârzie
 * răspunsul. Eșecurile sunt doar jurnalizate: reprocesarea periodică le reia.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type WaitUntilCtx = { waitUntil?: (promise: Promise<unknown>) => void };

const storage = new AsyncLocalStorage<WaitUntilCtx | undefined>();

export function runWithRequestContext<T>(ctx: unknown, fn: () => T): T {
  return storage.run(ctx as WaitUntilCtx | undefined, fn);
}

export function runAfterResponse(task: () => Promise<unknown>): void {
  const promise = Promise.resolve()
    .then(task)
    .catch((error) => console.error("[after-response] sarcina a eșuat", error));
  const ctx = storage.getStore();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(promise);
}

/**
 * Înregistrează o promisiune deja pornită la `waitUntil`, ca execuția să
 * continue chiar dacă apelantul închide conexiunea. Întoarce aceeași
 * promisiune, ca răspunsul să rămână neschimbat. `true` = înregistrată.
 */
export function keepAliveUntilSettled<T>(promise: Promise<T>): boolean {
  const ctx = storage.getStore();
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(promise.catch(() => undefined));
    return true;
  }
  return false;
}

type RouteWithHandlers = { options: { server?: { handlers?: unknown } } };

/**
 * Înregistrează la `waitUntil` lucrul fiecărui handler al unei rute de cron,
 * ca pg_net/cron să nu taie execuția când închid conexiunea. Răspunsul rămâne
 * exact cel întors de handler. Se aplică o singură dată, la încărcarea rutei.
 */
export function keepRouteHandlersAlive<R>(route: R): R {
  const server = (route as unknown as RouteWithHandlers).options.server;
  const handlers = server?.handlers as Record<string, unknown> | undefined;
  if (!handlers || typeof handlers !== "object") return route;
  for (const [method, handler] of Object.entries(handlers)) {
    if (typeof handler !== "function" || (handler as { __keepAlive?: true }).__keepAlive) continue;
    const wrapped = (...args: unknown[]) => {
      const work = Promise.resolve().then(() => (handler as (...a: unknown[]) => unknown)(...args));
      keepAliveUntilSettled(work);
      return work;
    };
    (wrapped as { __keepAlive?: true }).__keepAlive = true;
    handlers[method] = wrapped;
  }
  return route;
}
