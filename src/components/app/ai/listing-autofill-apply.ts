/** Aplicarea propunerilor AI în starea formularului (fără nicio scriere în baza de date). */
import type { TransactionValue } from "@/components/app/PropertyTransactionFields";
import { syncFloor } from "@/lib/property-floor";
import { onlyEmptyFields, splitAutofillValues, type AutofillProposal } from "@/lib/ai/listing-autofill/schema";

export type AutofillSetters = {
  setDetails: (fn: (d: Record<string, unknown>) => Record<string, unknown>) => void;
  setText: (patch: Partial<Record<"title" | "description" | "city" | "district" | "address", string>>) => void;
  setTx: (fn: (t: TransactionValue) => TransactionValue) => void;
};

export function applyAutofillTx(current: TransactionValue, t: { transaction?: "sale" | "rent"; price?: number; currency?: string }, keepTransaction: boolean): TransactionValue {
  const next = { ...current };
  if (t.transaction && !keepTransaction) { next.for_sale = t.transaction === "sale"; next.for_rent = t.transaction === "rent"; }
  const rent = t.transaction ? t.transaction === "rent" : next.for_rent && !next.for_sale;
  if (t.price != null) { if (rent) next.rent_price = t.price; else next.sale_price = t.price; }
  if (t.currency) { if (rent) next.rent_currency = t.currency; else next.sale_currency = t.currency; }
  return next;
}

/** Câmpurile curente, pentru modul „doar câmpurile goale”. */
export function currentAutofillValues(details: Record<string, unknown>, text: Record<string, string | undefined>, tx: TransactionValue): Record<string, unknown> {
  const rent = tx.for_rent && !tx.for_sale;
  return { ...details, ...text, transaction: "set", price: rent ? tx.rent_price : tx.sale_price, currency: (rent ? tx.rent_price : tx.sale_price) == null ? null : "set" };
}

/** Pune propunerea în formular și întoarce cheile marcate „AI”. */
export function applyAutofillProposal(raw: AutofillProposal, setters: AutofillSetters, current?: Record<string, unknown>): { proposal: AutofillProposal; keys: string[] } {
  const proposal = current ? onlyEmptyFields(raw, current) : raw;
  const { details, location, tx } = splitAutofillValues(proposal.values);
  if (typeof details["floor_label"] === "string") {
    const synced = syncFloor(details["floor_label"] as string, typeof details["floor"] === "number" ? (details["floor"] as number) : null);
    details["floor"] = synced.floor;
  }
  if (Object.keys(details).length) setters.setDetails((d) => ({ ...d, ...details }));
  const text = { ...location, ...(proposal.title ? { title: proposal.title } : {}), ...(proposal.description ? { description: proposal.description } : {}) };
  if (Object.keys(text).length) setters.setText(text);
  if (Object.keys(tx).length) setters.setTx((t) => applyAutofillTx(t, tx, Boolean(current)));
  return { proposal, keys: [...Object.keys(proposal.values), ...Object.keys(text).filter((k) => k === "title" || k === "description")] };
}

/** Golește un câmp propus de AI. */
export function clearAutofillField(key: string, setters: AutofillSetters): void {
  if (["title", "description", "city", "district", "address"].includes(key)) setters.setText({ [key]: "" });
  else if (key === "price") setters.setTx((t) => ({ ...t, sale_price: t.for_sale ? null : t.sale_price, rent_price: t.for_rent ? null : t.rent_price }));
  else if (key === "transaction" || key === "currency") return;
  else setters.setDetails((d) => ({ ...d, [key]: Array.isArray(d[key]) ? [] : null, ...(key === "floor_label" ? { floor: null } : {}) }));
}
