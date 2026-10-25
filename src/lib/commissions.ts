// Comisioane — logică pură (etichete, precompletare, totaluri, drepturi în UI).
// Sumele se introduc manual; nu se calculează procente.

export const commissionStatusLabels: Record<string, string> = {
  pending: "De încasat",
  collected: "Încasat",
  cancelled: "Anulat",
};
export const commissionPayerLabels: Record<string, string> = {
  buyer: "Cumpărător",
  seller: "Vânzător",
  owner: "Proprietar",
  tenant: "Chiriaș",
};
export const COMMISSION_CURRENCIES = ["EUR", "RON"] as const;

export type CommissionForm = {
  agent_id: string;
  transaction_date: string;
  transaction_kind: "sale" | "rent";
  property_type: string;
  property_id: string | null;
  contact_id: string | null;
  location_text: string;
  transaction_value: string;
  agency_commission: string;
  agent_amount: string;
  currency: "EUR" | "RON";
  payer: "buyer" | "seller" | "owner" | "tenant";
  status: "pending" | "collected" | "cancelled";
  collected_at: string;
  notes: string;
};

export function emptyCommissionForm(agentId: string, today = new Date()): CommissionForm {
  return {
    agent_id: agentId,
    transaction_date: today.toISOString().slice(0, 10),
    transaction_kind: "sale",
    property_type: "apartment",
    property_id: null,
    contact_id: null,
    location_text: "",
    transaction_value: "",
    agency_commission: "",
    agent_amount: "",
    currency: "EUR",
    payer: "buyer",
    status: "pending",
    collected_at: "",
    notes: "",
  };
}

/** Doar o sumă scrisă ca număr (ex. „1500”, „1.500,50”); procentele/textul se ignoră. */
export function parseAmountText(value: string | number | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const t = value.trim();
  if (!t || t.includes("%") || !/^[\d\s.,]+(\s*(eur|ron|lei|€))?$/i.test(t)) return "";
  let n = t.replace(/(eur|ron|lei|€)/gi, "").replace(/\s/g, "");
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, "").replace(",", ".");
  else n = n.replace(/[.,]/g, "");
  const num = Number(n);
  return Number.isFinite(num) && num > 0 ? String(num) : "";
}

const currencyOf = (c: string | null | undefined): "EUR" | "RON" =>
  c?.toUpperCase() === "RON" || c?.toLowerCase() === "lei" ? "RON" : "EUR";

export type PropertyPrefillSource = {
  id: string;
  transaction_kind: string | null;
  property_type: string | null;
  owner_contact_id: string | null;
  price: number | null;
  sale_price?: number | null;
  rent_price?: number | null;
  currency: string | null;
  sale_currency?: string | null;
  rent_currency?: string | null;
  commission: string | null;
  assigned_to?: string | null;
};

export function prefillFromProperty(base: CommissionForm, p: PropertyPrefillSource): CommissionForm {
  const kind = p.transaction_kind === "rent" ? "rent" : "sale";
  const price = kind === "rent" ? (p.rent_price ?? p.price) : (p.sale_price ?? p.price);
  const cur = kind === "rent" ? (p.rent_currency ?? p.currency) : (p.sale_currency ?? p.currency);
  return {
    ...base,
    transaction_kind: kind,
    property_type: p.property_type ?? base.property_type,
    property_id: p.id,
    contact_id: p.owner_contact_id ?? base.contact_id,
    transaction_value: parseAmountText(price) || base.transaction_value,
    agency_commission: parseAmountText(p.commission) || base.agency_commission,
    currency: currencyOf(cur),
    payer: kind === "rent" ? "owner" : base.payer,
  };
}

export type ContractPrefillSource = {
  property_id: string | null;
  contact_id: string | null;
  price: number | null;
  currency: string | null;
  commission: string | null;
};

export function prefillFromContract(
  base: CommissionForm,
  c: ContractPrefillSource,
  property: PropertyPrefillSource | null,
): CommissionForm {
  const fromProp = property ? prefillFromProperty(base, property) : base;
  return {
    ...fromProp,
    property_id: c.property_id ?? fromProp.property_id,
    contact_id: c.contact_id ?? fromProp.contact_id,
    transaction_value: parseAmountText(c.price) || fromProp.transaction_value,
    agency_commission: parseAmountText(c.commission) || fromProp.agency_commission,
    currency: c.currency ? currencyOf(c.currency) : fromProp.currency,
  };
}

export type CommissionRowLike = {
  agent_id: string;
  created_by: string;
  allocated_by_admin: boolean;
  agency_commission: number;
  agent_amount: number;
  currency: string;
  status: string;
};

/** Oglinda în UI a regulii din baza de date (care rămâne sursa de adevăr). */
export function canEditCommission(row: CommissionRowLike, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  return row.agent_id === userId && row.created_by === userId && !row.allocated_by_admin;
}

/** Totaluri pe monedă; anulatele nu intră în sume. */
export function commissionTotals(rows: CommissionRowLike[]) {
  const out: Record<string, { agency: number; agent: number; collected: number; pending: number }> = {};
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const t = (out[r.currency] ??= { agency: 0, agent: 0, collected: 0, pending: 0 });
    t.agency += Number(r.agency_commission) || 0;
    t.agent += Number(r.agent_amount) || 0;
    if (r.status === "collected") t.collected += Number(r.agency_commission) || 0;
    else t.pending += Number(r.agency_commission) || 0;
  }
  return out;
}

export function toCommissionPayload(f: CommissionForm) {
  const num = (s: string) => {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return {
    agent_id: f.agent_id,
    transaction_date: f.transaction_date,
    transaction_kind: f.transaction_kind,
    property_type: f.property_type,
    property_id: f.property_id,
    contact_id: f.contact_id,
    location_text: f.property_id ? null : f.location_text.trim() || null,
    transaction_value: num(f.transaction_value),
    agency_commission: num(f.agency_commission),
    agent_amount: num(f.agent_amount),
    currency: f.currency,
    payer: f.payer,
    status: f.status,
    collected_at: f.status === "collected" ? f.collected_at || null : null,
    notes: f.notes.trim() || null,
  };
}
