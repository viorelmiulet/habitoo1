/**
 * Funcții server pentru taxonomia Storia: citirea cache-ului și reîmprospătarea
 * manuală din Superadmin → Portaluri. Doar Superadmin; niciodată la publicare.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { StoriaTaxonomyCache } from "@/lib/portals/storia/taxonomy.server";

type SuperadminContext = {
  supabase: {
    rpc: (
      fn: "is_superadmin",
    ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
  };
  userId: string;
};

async function requireSuperadmin(context: SuperadminContext): Promise<void> {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: taxonomia portalurilor se gestionează doar de Superadmin.");
  }
}

export type StoriaTaxonomyState =
  | { ok: true; cache: StoriaTaxonomyCache | null }
  | { ok: false; error: string };

export const getStoriaTaxonomyState = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<StoriaTaxonomyState> => {
    await requireSuperadmin(context as unknown as SuperadminContext);
    try {
      const { readStoriaTaxonomyCache } = await import("@/lib/portals/storia/taxonomy.server");
      return { ok: true, cache: await readStoriaTaxonomyCache() };
    } catch (error) {
      console.error("[storia-taxonomy] citirea cache-ului a eșuat", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Cache-ul de taxonomie nu a putut fi citit.",
      };
    }
  });

export const refreshStoriaTaxonomy = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<StoriaTaxonomyState> => {
    const ctx = context as unknown as SuperadminContext;
    await requireSuperadmin(ctx);
    try {
      const { refreshStoriaTaxonomyCache } = await import("@/lib/portals/storia/taxonomy.server");
      // Tokenul agenției conectate e folosit dacă există; taxonomia se poate
      // citi și doar cu cheia de aplicație.
      let accessToken: string | null = null;
      if (data.organizationId) {
        try {
          const { getStoriaAccessToken } = await import("@/lib/portals/storia/oauth.server");
          accessToken = await getStoriaAccessToken(data.organizationId);
        } catch {
          accessToken = null;
        }
      }
      const cache = await refreshStoriaTaxonomyCache({
        organizationId: data.organizationId ?? null,
        actorId: ctx.userId,
        accessToken,
      });
      return { ok: true, cache };
    } catch (error) {
      console.error("[storia-taxonomy] reîmprospătarea a eșuat", error);
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Taxonomia Storia nu a putut fi reîmprospătată.",
      };
    }
  });
