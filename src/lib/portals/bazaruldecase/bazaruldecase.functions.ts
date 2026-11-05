import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireSuperadmin(context: unknown) {
  const ctx = context as { supabase: { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> } };
  const { data, error } = await ctx.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    setResponseStatus(403);
    throw new Error("Acces refuzat: doar Superadmin.");
  }
}

/** Linkul feedului XML al agenției (cu tokenul ei din index). Doar SuperAdmin. */
export const getBazarulFeedLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context);
    const key = process.env["BAZARULDECASE_INDEX_KEY"];
    if (!key) return { configured: false as const, xmlUrl: null };
    const [{ clickimobFeedToken, indexXmlUrl }, { properstarEntityId }] = await Promise.all([
      import("@/lib/portals/clickimob/index-feed"),
      import("@/lib/portals/properstar/mapper"),
    ]);
    const token = clickimobFeedToken(properstarEntityId("hb", data.organizationId), key, "bazaruldecase");
    return { configured: true as const, xmlUrl: indexXmlUrl("bazaruldecase", "https://crm.habitoo.ro", token) };
  });

/** „Testează”: construiește XML-ul agenției, îl parsează și întoarce numărul de oferte + avertismentele. */
export const testBazarulFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context);
    const [{ buildBazarulKyeroFeed }, { checkKyeroXml }] = await Promise.all([
      import("@/lib/portals/bazaruldecase/feed.server"),
      import("@/lib/portals/bazaruldecase/check"),
    ]);
    const build = await buildBazarulKyeroFeed({ organizationId: data.organizationId, requestUrl: "https://crm.habitoo.ro/" });
    const check = checkKyeroXml(build.xml);
    return { ok: check.ok, error: check.error, properties: check.properties, offers: build.offers, warnings: build.warnings.slice(0, 50) };
  });
