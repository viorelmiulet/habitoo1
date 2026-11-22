/**
 * Verificarea anunțului pe server. Doar citiri; nicio scriere.
 * Agentul poate verifica doar proprietățile asignate lui; administratorii
 * agenției și SuperAdmin pe cele vizibile prin RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ListingCheckResult } from "./rules";

export type ListingCheckRow = ListingCheckResult & { propertyId: string; reference: string | null; title: string | null };

export const MAX_BULK_CHECK = 100;

export const checkListings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { propertyIds: string[] }) => {
    const ids = [...new Set((input?.propertyIds ?? []).filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))];
    if (ids.length === 0) throw new Error("Selectează cel puțin un anunț.");
    if (ids.length > MAX_BULK_CHECK) throw new Error(`Poți verifica maximum ${MAX_BULK_CHECK} de anunțuri odată.`);
    return { propertyIds: ids };
  })
  .handler(async ({ data, context }) => {
    const { runListingChecks } = await import("./check.server");
    return runListingChecks(context.supabase as never, context.userId, data.propertyIds);
  });
