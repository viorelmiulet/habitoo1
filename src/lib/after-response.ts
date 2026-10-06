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
