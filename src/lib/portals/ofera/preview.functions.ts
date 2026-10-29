import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { oferaCurrency } from "./mapper";

export const previewOferaPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { propertyId: string }) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_superadmin");
    if (allowed !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const { buildOferaPreview } = await import("./preview.server");
    return buildOferaPreview(data.propertyId);
  });
export const getOferaPriceCurrency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed } = await context.supabase.rpc("is_superadmin");
    if (allowed !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const { data, error } = await context.supabase.from("platform_settings").select("value").eq("key", "ofera_price_currency").maybeSingle();
    if (error) throw new Error("Moneda Ofera nu a putut fi citită.");
    return oferaCurrency(data?.value);
  });
export const saveOferaPriceCurrency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { currency: "EUR" | "RON" }) => z.object({ currency: z.enum(["EUR", "RON"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_superadmin");
    if (allowed !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await db.from("platform_settings").upsert({ key: "ofera_price_currency", value: data.currency, updated_at: new Date().toISOString(), updated_by: context.userId });
    if (error) throw new Error("Moneda Ofera nu a putut fi salvată.");
    const { error: auditError } = await db.from("audit_logs").insert({ organization_id: null, actor_id: context.userId, action: "platform.settings_updated", entity: "platform_settings", new_values: { key: "ofera_price_currency", currency: data.currency } });
    if (auditError) throw new Error("Moneda a fost salvată, dar înregistrarea în istoric nu a reușit.");
    return data.currency;
  });