import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { deviceNameFromUserAgent, generateExtensionToken, isValidNonce, sha256Hex } from "@/lib/extension/core";

type Ctx = { userId: string };

/** Emite un token doar pentru un nonce valid; în DB se salvează numai hash-ul. Tokenul nu se loghează. */
export const connectExtension = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ nonce: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!isValidNonce(data.nonce)) throw new Error("Cerere de conectare invalidă.");
    const { userId } = context as unknown as Ctx;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: p } = await db.from("profiles").select("organization_id,is_active").eq("id", userId).maybeSingle();
    if (!p?.organization_id || !p.is_active) throw new Error("Extensia se poate conecta doar la un cont de agenție activ.");
    const token = generateExtensionToken();
    const { error } = await db.from("extension_tokens").insert({
      user_id: userId, organization_id: p.organization_id, token_hash: await sha256Hex(token),
      device_name: deviceNameFromUserAgent(getRequestHeader("user-agent")),
    });
    if (error) throw new Error("Nu am putut conecta extensia.");
    return { token };
  });

export const listExtensionTokens = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }) => {
    const { data } = await (context as unknown as { supabase: import("@supabase/supabase-js").SupabaseClient }).supabase
      .from("extension_tokens").select("id,device_name,created_at,last_used_at").is("revoked_at", null).order("created_at", { ascending: false });
    return (data ?? []) as { id: string; device_name: string; created_at: string; last_used_at: string | null }[];
  });

export const revokeExtensionToken = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as unknown as Ctx;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.from("extension_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", userId).is("revoked_at", null);
    return { ok: true };
  });

const contactPhone = z.string().trim().max(40).regex(/^[+\d\s().-]*$/, "Număr de telefon invalid.");

/** Datele de contact din postările Facebook ale extensiei (doar utilizatorul curent). */
export const getListingContact = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }) => {
    const { userId } = context as unknown as Ctx;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data } = await db.from("profiles").select("full_name,phone,listing_phone,whatsapp").eq("id", userId).maybeSingle();
    return data ?? { full_name: null, phone: null, listing_phone: null, whatsapp: null };
  });

export const updateListingContact = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ listing_phone: contactPhone, whatsapp: contactPhone }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as unknown as Ctx;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await db.from("profiles").update({ listing_phone: data.listing_phone || null, whatsapp: data.whatsapp || null }).eq("id", userId);
    if (error) throw new Error("Nu am putut salva datele de contact.");
    return { ok: true as const };
  });
