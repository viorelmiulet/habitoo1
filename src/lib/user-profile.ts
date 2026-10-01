// Reguli pure pentru profilul utilizatorului: telefon mobil RO, ecranul obligatoriu
// și cine poate edita profilul cui. Folosite identic în interfață și pe server.
import { z } from "zod";

/** Mobil RO: 07xx xxx xxx sau +40/0040 7xx xxx xxx. Se salvează ca 07xxxxxxxx. */
export function normalizeRoMobile(raw: string | null | undefined): string | null {
  const v = (raw ?? "").replace(/[\s.\-()]/g, "");
  const m = /^(?:\+40|0040|0)(7\d{8})$/.exec(v);
  return m ? `0${m[1]}` : null;
}

export const PHONE_ERROR = "Telefon mobil invalid (ex. 0722 123 456 sau +40 722 123 456).";

export const fullNameSchema = z
  .string()
  .trim()
  .min(3, "Numele complet este obligatoriu.")
  .max(120, "Numele este prea lung.")
  .refine((v) => /\S+\s+\S+/.test(v), "Scrie prenumele și numele.");

export const mobilePhoneSchema = z
  .string()
  .trim()
  .refine((v) => normalizeRoMobile(v) !== null, PHONE_ERROR)
  .transform((v) => normalizeRoMobile(v)!);

/** Câmpurile editabile ale profilului. `.strict()`: emailul, rolul sau agenția sunt respinse. */
export const profileEditSchema = z
  .object({
    userId: z.string().uuid(),
    full_name: fullNameSchema,
    phone: mobilePhoneSchema,
    job_title: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

export type ProfileEditInput = z.input<typeof profileEditSchema>;

export const inviteAgentSchema = z.object({
  email: z.string().trim().email("Adresa de email nu este validă.").max(255),
  full_name: fullNameSchema,
  phone: mobilePhoneSchema,
});

export function isProfileComplete(p: { full_name?: string | null; phone?: string | null } | null) {
  return Boolean(p) && fullNameSchema.safeParse(p?.full_name ?? "").success && normalizeRoMobile(p?.phone) !== null;
}

/** Ecranul „Completează-ți profilul”: utilizatori din agenții, fără superadmin și fără impersonare. */
export function mustCompleteUserProfile(input: {
  roles: string[];
  impersonating: boolean;
  profile: { full_name?: string | null; phone?: string | null } | null;
}): boolean {
  if (input.impersonating) return false;
  if (input.roles.includes("superadmin")) return false;
  if (!input.roles.includes("agent") && !input.roles.includes("agency_admin")) return false;
  return !isProfileComplete(input.profile);
}

export type ProfileActor = { id: string; organizationId: string | null; roles: string[] };
export type ProfileTarget = { id: string; organizationId: string | null; roles: string[] };

/** `null` = permis; altfel motivul refuzului. */
export function profileEditDenial(actor: ProfileActor, target: ProfileTarget): string | null {
  if (actor.roles.includes("superadmin")) return null;
  if (actor.id === target.id) return null;
  if (!actor.roles.includes("agency_admin")) return "Poți edita doar propriul profil.";
  if (!actor.organizationId || actor.organizationId !== target.organizationId) {
    return "Utilizatorul nu face parte din agenția ta.";
  }
  if (target.roles.includes("superadmin") || target.roles.includes("agency_admin")) {
    return "Datele altui administrator nu pot fi modificate.";
  }
  if (!target.roles.includes("agent")) return "Poți edita doar agenții agenției tale.";
  return null;
}
