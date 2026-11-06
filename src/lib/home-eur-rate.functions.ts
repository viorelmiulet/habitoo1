import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HomeEurRate = { day: string; rate: number; previous: number | null } | null;

/** Cursul BNR EUR/RON cel mai recent (reîmprospătat din BNR dacă stocul e mai vechi de o zi). */
export const getHomeEurRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<HomeEurRate> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchRatesIntoCache } = await import("@/lib/commissions-rates.server");
    const read = async () => {
      const { data } = await supabaseAdmin.from("exchange_rates").select("day,eur_ron").eq("source", "BNR").order("day", { ascending: false }).limit(2);
      return data ?? [];
    };
    const today = new Date().toISOString().slice(0, 10);
    let rows = await read();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (!rows[0] || rows[0].day < yesterday) {
      try { await fetchRatesIntoCache(supabaseAdmin.from("exchange_rates") as never, today); rows = await read(); }
      catch (e) { console.warn("[home eur rate]", e instanceof Error ? e.message : "failed"); }
    }
    if (!rows[0]) return null;
    return { day: rows[0].day, rate: Number(rows[0].eur_ron), previous: rows[1] ? Number(rows[1].eur_ron) : null };
  });
