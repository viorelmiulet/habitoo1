// Crearea directă a unei agenții de către superadmin: cont confirmat fără email,
// organizație marcată `created_by_superadmin`, profil și rol `agency_admin`.
// Logica e pură (dependențe injectate) pentru a putea fi testată fără apeluri reale.
import { z } from "zod";
import { PLAN_KEYS } from "@/lib/plans";
import { SUBSCRIPTION_TERMS } from "@/lib/subscription";

const opt = z.string().trim().max(200).optional();

export const createAgencySchema = z.object({
  name: z.string().trim().min(1, "Numele agenției este obligatoriu.").max(200),
  email: z.string().trim().toLowerCase().email("Adresa de email nu este validă.").max(255),
  password: z.string().min(8, "Parola trebuie să aibă minimum 8 caractere.").max(72),
  legal_name: opt,
  cui: opt,
  trade_registry_number: opt,
  phone: opt,
  city: opt,
  full_name: opt,
  plan: z.enum(PLAN_KEYS).optional(),
  term: z.enum(SUBSCRIPTION_TERMS).optional(),
});
export type CreateAgencyInput = z.input<typeof createAgencySchema>;

export const EMAIL_IN_USE_MESSAGE = "Există deja un cont cu acest email. Nu s-a creat nimic.";

export type CreateAgencyDeps = {
  isSuperadmin: () => Promise<boolean>;
  createAuthUser: (email: string, password: string) => Promise<{ id: string } | { error: string; emailInUse: boolean }>;
  createAgencyRows: (userId: string, input: Omit<z.output<typeof createAgencySchema>, "password">) => Promise<string>;
  deleteAuthUser: (userId: string) => Promise<void>;
};

export async function createAgencyCore(deps: CreateAgencyDeps, raw: CreateAgencyInput) {
  if (!(await deps.isSuperadmin())) {
    throw new Error("Acces refuzat: acțiunea este permisă exclusiv superadminului.");
  }
  const { password, ...rest } = createAgencySchema.parse(raw);
  const created = await deps.createAuthUser(rest.email, password);
  if ("error" in created) {
    throw new Error(created.emailInUse ? EMAIL_IN_USE_MESSAGE : "Contul administratorului nu a putut fi creat.");
  }
  try {
    const organizationId = await deps.createAgencyRows(created.id, rest);
    return { organizationId, userId: created.id };
  } catch (e) {
    await deps.deleteAuthUser(created.id);
    throw new Error(`Agenția nu a putut fi creată: ${e instanceof Error ? e.message : "eroare necunoscută"}`);
  }
}

export function isEmailInUseError(err: { message?: string; code?: string; status?: number } | null | undefined) {
  if (!err) return false;
  return err.code === "email_exists" || err.status === 422 || /already (been )?registered|already exists/i.test(err.message ?? "");
}
