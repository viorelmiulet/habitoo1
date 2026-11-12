/**
 * Publicarea anunțului cu verificarea pe server a câmpurilor obligatorii
 * (aceeași funcție pură ca în cardul „Grad de completare”).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

type Ctx = { userId: string; supabase: import("@supabase/supabase-js").SupabaseClient };

export const publishPropertyChecked = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { loadPropertyCompleteness } = await import("@/lib/property-completeness.server");
    const { property, message } = await loadPropertyCompleteness(ctx.supabase, data.propertyId);
    if (message) throw new Error(message);
    const { error } = await ctx.supabase.from("properties").update({
      publish_status: "published",
      published_at: new Date().toISOString(),
      ...(property.status === "draft" ? { status: "active" } : {}),
    } as never).eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
