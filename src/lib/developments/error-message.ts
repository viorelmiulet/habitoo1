/** Human-readable message for unknown errors, including PostgrestError-like objects. */
export function errorMessage(e: unknown, fallback: string): string {
  if (!e || typeof e !== 'object') return fallback;
  const o = e as { code?: unknown; message?: unknown };
  const msg = typeof o.message === 'string' ? o.message.trim() : '';
  if (o.code === '42501' || /row-level security/i.test(msg)) return 'Nu ai drepturi să salvezi acest ansamblu.';
  if (o.code === '23514') return 'Unele valori nu sunt valide (verifică suprafețele și prețurile).';
  return msg || fallback;
}
