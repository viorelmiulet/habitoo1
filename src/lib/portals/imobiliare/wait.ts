import { PortalError } from "../errors";

/** Longest any Imobiliare.ro lock, queue or storage/database wait may last. */
export const IMOBILIARE_WAIT_MS = 20_000;
/** An in-memory lock older than this is treated as held by a dead run. */
export const IMOBILIARE_LOCK_TTL_MS = 120_000;
export const IMOBILIARE_BLOCKED_MESSAGE = "Imobiliare.ro: operație blocată de o rulare anterioară; reîncearcă";

/** Rejects with a clear PortalError when `work` does not settle within `ms`. */
export function withImobiliareTimeout<T>(work: PromiseLike<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PortalError("TIMEOUT", null, message)), ms);
  });
  return Promise.race([Promise.resolve(work), timeout]).finally(() => clearTimeout(timer));
}
