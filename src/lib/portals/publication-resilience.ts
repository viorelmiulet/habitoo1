export const PORTAL_CALL_TIMEOUT_MS = 15_000;
export const ABANDONED_JOB_MESSAGE = "Portalul nu a răspuns de 3 ori; se reîncearcă la următoarea republicare";
export const RELAY_FAILURE_MESSAGE = "Releul cu IP fix (relay.habitoo.ro) nu răspunde";

export function republishIsStalled(createdAt: string, lastFinishedAt: string | null, now = Date.now()): boolean {
  return now - Date.parse(createdAt) > 30 * 60_000 &&
    now - Date.parse(lastFinishedAt ?? createdAt) > 10 * 60_000;
}

/** Bound headers AND body, even when a test transport ignores the abort signal. */
export async function withPortalDeadline<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = PORTAL_CALL_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException("Portal timeout", "AbortError"));
    }, timeoutMs);
  });
  try { return await Promise.race([run(controller.signal), expired]); }
  finally { clearTimeout(timer); }
}