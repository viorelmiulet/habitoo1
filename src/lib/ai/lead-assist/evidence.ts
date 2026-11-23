import { diffRequest, fold, sanitizeExtraction, type LeadAiResponse, type ProposedChange, type RequestLike } from "./schema";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** One real source fragment per field, revalidated using the same extraction guard. */
export function evidencedChanges(existing: RequestLike, raw: LeadAiResponse["request"], source: string): ProposedChange[] {
  const extracted = sanitizeExtraction(raw, source);
  const fragments = source.split(/(?<=[.!?;\n])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const changes = diffRequest(existing, extracted);
  if (changes.some(c => c.field === "budget_min" || c.field === "budget_max") && extracted.currency && !changes.some(c => c.field === "currency")) {
    changes.push({ field: "currency", value: extracted.currency, text: `Clientul a menționat moneda ${extracted.currency}` });
  }
  return changes.flatMap(change => {
    const fragment = fragments.find(text => {
      const value = sanitizeExtraction({ [change.field]: change.value } as LeadAiResponse["request"], text)[change.field];
      return Array.isArray(change.value) ? Array.isArray(value) && change.value.every(v => value.includes(v)) : same(value, change.value);
    }) ?? source.trim();
    const value = sanitizeExtraction({ [change.field]: change.value } as LeadAiResponse["request"], fragment)[change.field];
    if (value === null || (Array.isArray(value) && value.length === 0)) return [];
    if (change.field === "term" && !fold(fragment).includes(fold(String(change.value)))) return [];
    return [{ ...change, evidence: fragment }];
  });
}
