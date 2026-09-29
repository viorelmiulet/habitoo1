// Datele publice obligatorii ale agenției: alimentează indexul ClickImob, Properstar și celelalte feeduri.
// Aceeași regulă se aplică în pagină (poarta din /app) și pe server (requireActiveOrgAuth).
import { z } from "zod";

export const AGENCY_REQUIRED_FIELDS = [
  "email",
  "phone",
  "material_address",
  "city",
  "postal_code",
] as const;
export type AgencyRequiredField = (typeof AGENCY_REQUIRED_FIELDS)[number];

export const AGENCY_FIELD_LABELS: Record<AgencyRequiredField, string> = {
  email: "Email",
  phone: "Telefon",
  material_address: "Adresa biroului",
  city: "Oraș",
  postal_code: "Cod poștal",
};

export const AGENCY_DATA_INCOMPLETE_CODE = "AGENCY_DATA_INCOMPLETE";

type OrgLike = Partial<Record<AgencyRequiredField, string | null>> & { status?: string | null };

export function missingAgencyPublicFields(org: OrgLike | null | undefined): AgencyRequiredField[] {
  if (!org) return [];
  return AGENCY_REQUIRED_FIELDS.filter((f) => !String(org[f] ?? "").trim());
}

/**
 * Doar adminul de agenție al unei agenții active (sau în probă — tot `active`) e oprit.
 * Superadminul, inclusiv când lucrează în contul unei agenții, și agenții nu sunt opriți.
 */
export function mustCompleteAgencyData(input: {
  roles: string[];
  impersonating: boolean;
  org: OrgLike | null | undefined;
}): boolean {
  if (input.impersonating) return false;
  if (input.roles.includes("superadmin")) return false;
  if (!input.roles.includes("agency_admin")) return false;
  if (!input.org || (input.org.status ?? "active") !== "active") return false;
  return missingAgencyPublicFields(input.org).length > 0;
}

/** Telefon românesc: 07xx / 02xx / 03xx, cu +40 sau 0040 opțional; spațiile, punctele și cratimele se ignoră. */
export function normalizeRoPhone(raw: string): string | null {
  const v = raw.replace(/[\s.\-()]/g, "");
  const m = /^(?:\+40|0040|0)([237]\d{8})$/.exec(v);
  return m ? `0${m[1]}` : null;
}

export const agencyFieldSchemas = {
  email: z.string().trim().email("Email invalid.").max(255),
  phone: z
    .string()
    .trim()
    .refine((v) => normalizeRoPhone(v) !== null, "Telefon românesc invalid (ex. 0722 123 456)."),
  material_address: z.string().trim().min(5, "Adresa biroului este prea scurtă.").max(300),
  city: z.string().trim().min(2, "Orașul este obligatoriu.").max(120),
  postal_code: z.string().trim().regex(/^\d{6}$/, "Codul poștal trebuie să aibă 6 cifre."),
} satisfies Record<AgencyRequiredField, z.ZodTypeAny>;

export const agencyWebsiteSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^https:\/\/[^\s]+\.[^\s]+$/i, "Website-ul trebuie să înceapă cu https://.");

export const completeAgencyDataSchema = z.object({
  email: agencyFieldSchemas.email.optional(),
  phone: agencyFieldSchemas.phone.optional(),
  material_address: agencyFieldSchemas.material_address.optional(),
  city: agencyFieldSchemas.city.optional(),
  postal_code: agencyFieldSchemas.postal_code.optional(),
  material_website: agencyWebsiteSchema.optional(),
});
export type CompleteAgencyDataInput = z.input<typeof completeAgencyDataSchema>;

/** Valorile de scris: doar câmpurile lipsă (cele completate nu se suprascriu), telefon normalizat. */
export function buildCompletionPatch(
  org: OrgLike & { material_website?: string | null },
  input: z.output<typeof completeAgencyDataSchema>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const f of missingAgencyPublicFields(org)) {
    const v = input[f];
    if (!v) throw new Error(`${AGENCY_FIELD_LABELS[f]} este obligatoriu.`);
    patch[f] = f === "phone" ? (normalizeRoPhone(v) as string) : v;
  }
  if (input.material_website && !org.material_website?.trim()) {
    patch.material_website = input.material_website;
  }
  return patch;
}

/** Validare pentru Setări → Agenție: câmpurile obligatorii nu pot fi golite. */
export function validateRequiredAgencyField(field: AgencyRequiredField, value: string): string | null {
  const r = agencyFieldSchemas[field].safeParse(value);
  return r.success ? null : (r.error.issues[0]?.message ?? "Valoare invalidă.");
}
