import type { ImobiliareTransaction } from "./payload.server";

const SEPARATOR = ",";

export function parseImobiliareReferences(value: string | null | undefined): string[] {
  return [...new Set((value ?? "").split(SEPARATOR).map((entry) => entry.trim()).filter(Boolean))];
}

export function serializeImobiliareReferences(values: string[]): string | null {
  const unique = [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
  return unique.length ? unique.join(SEPARATOR) : null;
}

export function referenceForTransaction(
  stored: string[],
  transaction: ImobiliareTransaction,
  fallback: string,
  planCount: number,
): string {
  if (stored.length === 0) return fallback;
  if (planCount === 1 && stored.length === 1) return stored[0] ?? fallback;
  const suffix = transaction === "sale" ? "-V" : "-C";
  return stored.find((reference) => reference.endsWith(suffix)) ?? fallback;
}