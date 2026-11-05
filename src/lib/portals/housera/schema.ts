/** Housera.ro: forma vocabularului `GET /schema` (doar ce folosește Habitoo) și utilitare pure. */
export type HouseraCode = { code: string; label?: string };
export type HouseraSchemaField = {
  type: string;
  types?: string[] | null;
  transactions?: string[] | null;
  values?: HouseraCode[] | null;
  values_by_type?: Record<string, HouseraCode[]> | null;
  values_from?: string | null;
};
export type HouseraSchema = {
  locale?: string;
  version?: string;
  types: Array<{ code: string; label?: string; transactions: string[]; subtypes?: HouseraCode[] }>;
  transactions?: Array<{ code: string; label?: string; price_period?: string }>;
  currencies: string[];
  fields: Record<string, HouseraSchemaField>;
  features: Array<{ code: string; label?: string; group?: string; types?: string[] | null; transactions?: string[] | null }>;
  retired?: Array<{ kind: string; code: string; replaced_by: string; retired_on?: string }>;
  withdrawn?: Array<{ kind: string; code: string; withdrawn_on?: string }>;
};

/** Validare minimă a corpului primit; un vocabular incomplet nu se salvează. */
export function parseHouseraSchema(body: unknown): HouseraSchema | null {
  if (!body || typeof body !== "object") return null;
  const s = body as Partial<HouseraSchema>;
  if (!Array.isArray(s.types) || !s.fields || typeof s.fields !== "object" || !Array.isArray(s.features) || !Array.isArray(s.currencies)) return null;
  return {
    locale: s.locale, version: s.version, types: s.types, transactions: s.transactions ?? [],
    currencies: s.currencies, fields: s.fields, features: s.features,
    retired: Array.isArray(s.retired) ? s.retired : [], withdrawn: Array.isArray(s.withdrawn) ? s.withdrawn : [],
  };
}

export function houseraFieldApplies(schema: HouseraSchema, field: string, type: string, transaction: string): boolean {
  const f = schema.fields[field];
  if (!f) return false;
  if (Array.isArray(f.types) && !f.types.includes(type)) return false;
  if (Array.isArray(f.transactions) && !f.transactions.includes(transaction)) return false;
  return true;
}

export function houseraFieldValues(schema: HouseraSchema, field: string, type: string): string[] | null {
  const f = schema.fields[field];
  if (!f) return null;
  const byType = f.values_by_type?.[type];
  const list = byType ?? f.values;
  return Array.isArray(list) ? list.map((v) => v.code) : null;
}
