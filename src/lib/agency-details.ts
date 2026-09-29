// Validarea datelor unei agenții editate de superadmin (client + server).
import { z } from "zod";

const opt = (schema: z.ZodString) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(schema.nullable());

export const agencyDetailsSchema = z.object({
  name: z.string().trim().min(1, "Numele este obligatoriu.").max(200),
  legal_name: opt(z.string().max(200)),
  cui: opt(z.string().regex(/^(RO)?\d{2,10}$/i, "CUI: doar cifre, cu „RO” opțional în față.")),
  trade_registry_number: opt(z.string().max(50)),
  email: opt(z.string().email("Email invalid.").max(255)),
  phone: opt(z.string().max(40)),
  city: opt(z.string().max(120)),
  postal_code: opt(z.string().regex(/^\d{6}$/, "Codul poștal trebuie să aibă 6 cifre.")),
  material_phone: opt(z.string().max(40)),
  material_email: opt(z.string().email("Email de prezentare invalid.").max(255)),
  material_website: opt(
    z.string().max(300).regex(/^https:\/\/[^\s]+\.[^\s]+$/i, "Website-ul trebuie să înceapă cu https://."),
  ),
  material_address: opt(z.string().max(300)),
});

export type AgencyDetailsInput = z.input<typeof agencyDetailsSchema>;
export type AgencyDetails = z.output<typeof agencyDetailsSchema>;
export const AGENCY_DETAIL_FIELDS = Object.keys(agencyDetailsSchema.shape) as (keyof AgencyDetails)[];

/** Doar câmpurile schimbate, cu valoarea veche și cea nouă. */
export function diffAgencyDetails(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
) {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const f of fields) {
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    if (a !== b) {
      oldValues[f] = a;
      newValues[f] = b;
    }
  }
  return { oldValues, newValues, changed: Object.keys(newValues) };
}
