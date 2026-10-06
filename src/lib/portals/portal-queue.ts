/**
 * Coada de publicare pe portaluri, în browser (la nivel de modul, deci
 * supraviețuiește schimbării filei sau a paginii în aceeași sesiune).
 *
 * - fiecare portal = o sarcină separată, cu o singură selecție;
 * - maximum `PORTAL_QUEUE_CONCURRENCY` sarcini rulează simultan;
 * - aceeași pereche proprietate+portal nu poate fi trimisă de două ori cât e în lucru;
 * - eșecul unei sarcini nu le oprește pe celelalte.
 */
export const PORTAL_QUEUE_CONCURRENCY = 3;

export type PortalTask<T> = {
  propertyId: string;
  portalId: string;
  run: () => Promise<T>;
  onDone?: (result: { ok: true; value: T } | { ok: false; error: unknown }) => void;
};

export function portalTaskKey(propertyId: string, portalId: string) {
  return `${propertyId}:${portalId}`;
}

export function createPortalQueue(concurrency = PORTAL_QUEUE_CONCURRENCY) {
  const inFlight = new Set<string>();
  const waiting: PortalTask<unknown>[] = [];
  let running = 0;
  const listeners = new Set<() => void>();
  let snapshot: ReadonlySet<string> = new Set();

  const emit = () => {
    snapshot = new Set(inFlight);
    for (const listener of listeners) listener();
  };

  const pump = () => {
    while (running < concurrency && waiting.length > 0) {
      const task = waiting.shift()!;
      running += 1;
      const key = portalTaskKey(task.propertyId, task.portalId);
      void (async () => {
        let outcome: { ok: true; value: unknown } | { ok: false; error: unknown };
        try {
          outcome = { ok: true, value: await task.run() };
        } catch (error) {
          outcome = { ok: false, error };
        }
        running -= 1;
        inFlight.delete(key);
        emit();
        try {
          task.onDone?.(outcome);
        } finally {
          pump();
        }
      })();
    }
  };

  return {
    /** `false` dacă portalul e deja în lucru pentru această proprietate. */
    enqueue<T>(task: PortalTask<T>): boolean {
      const key = portalTaskKey(task.propertyId, task.portalId);
      if (inFlight.has(key)) return false;
      inFlight.add(key);
      waiting.push(task as PortalTask<unknown>);
      emit();
      pump();
      return true;
    },
    isBusy(propertyId: string, portalId: string) {
      return inFlight.has(portalTaskKey(propertyId, portalId));
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    get running() {
      return running;
    },
  };
}

/** Coada unică a sesiunii. */
export const portalQueue = createPortalQueue();
