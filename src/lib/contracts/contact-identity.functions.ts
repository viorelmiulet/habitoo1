import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const contactInput = z.object({ contactId: z.string().uuid() });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const text = z.string().trim().max(300).nullable().optional();

export const getContactIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => contactInput.parse(data))
  .handler(async ({ data, context }) => {
    const { assertContactIdentityAccess, maskedContactIdentity } = await import("./contact-identity.server");
    await assertContactIdentityAccess(context.supabase, data.contactId);
    const { data: row, error } = await context.supabase.from("contact_identities").select("*").eq("contact_id", data.contactId).maybeSingle();
    if (error) throw new Error("Datele de identitate nu au putut fi citite.");
    return row ? maskedContactIdentity(row) : null;
  });

export const saveContactIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => contactInput.extend({
    doc_type: z.enum(["ci", "cei", "pasaport", "permis_sedere", "altul"]),
    full_name: z.string().trim().min(3).max(160),
    birth_date: date, birth_place: text, citizenship: text, sex: text,
    cnp: z.string().trim().regex(/^\d{13}$/).optional(),
    idSeries: z.string().trim().max(10).optional(), idNumber: z.string().trim().max(20).optional(),
    id_issuer: text, id_issued_on: date, expires_at: date, address: text,
    address_source: z.enum(["act", "certificat_domiciliu", "manual"]),
    extracted_at: z.string().datetime().nullable().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertContactIdentityAccess, encryptedIdentityValues } = await import("./contact-identity.server");
    await assertContactIdentityAccess(context.supabase, data.contactId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { contactId, cnp, idSeries, idNumber, ...fields } = data;
    const encrypted = encryptedIdentityValues({ cnp, idSeries, idNumber });
    // Omitted sensitive inputs preserve stored values instead of clearing them.
    const { error } = await supabaseAdmin.from("contact_identities").upsert({
      ...fields, contact_id: contactId,
      ...(cnp !== undefined ? { cnp_enc: encrypted.cnp_enc } : {}),
      ...(idSeries !== undefined ? { id_series_enc: encrypted.id_series_enc } : {}),
      ...(idNumber !== undefined ? { id_number_enc: encrypted.id_number_enc } : {}),
      confirmed_by: context.userId, updated_at: new Date().toISOString(),
    }, { onConflict: "contact_id" });
    if (error) throw new Error("Datele de identitate nu au putut fi salvate.");
    return { ok: true };
  });