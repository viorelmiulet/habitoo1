/** Bounded, single-flight cache. Only successful resolutions are retained. */
export function createMediaCache<T>(ttlMs: number, now = Date.now, maxEntries = 2000) {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  const pending = new Map<string, Promise<T | null>>();
  return async (key: string, load: () => Promise<T | null>): Promise<T | null> => {
    const entry = entries.get(key);
    if (entry && now() < entry.expiresAt) return entry.value;
    entries.delete(key);
    const running = pending.get(key);
    if (running) return running;
    const startedAt = now();
    const work = Promise.resolve().then(load).then((value) => {
      if (value !== null && now() < startedAt + ttlMs) {
        if (entries.size >= maxEntries) {
          const oldest = entries.keys().next().value;
          if (oldest !== undefined) entries.delete(oldest);
        }
        entries.set(key, { value, expiresAt: startedAt + ttlMs });
      }
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
}