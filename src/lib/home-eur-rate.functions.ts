import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HomeEurRate = { day: string; rate: number; previous: number | null; previousDay: string | null } | null;

/** Cursul BNR EUR/RON cel mai recent (reîmprospătat din BNR dacă stocul e mai vechi de o zi). */
export const getHomeEurRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<HomeEurRate> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchRatesIntoCache, bnrFeedUrls, parseBnrYearXml } = await import("@/lib/commissions-rates.server");
    const read = async () => {
      const { data } = await supabaseAdmin.from("exchange_rates").select("day,eur_ron").eq("source", "BNR").order("day", { ascending: false }).limit(2);
      return data ?? [];
    };
    const today = new Date().toISOString().slice(0, 10);
    let rows = await read();
    // La fiecare deschidere: dacă nu avem cursul de azi, întrebăm BNR (publică în zilele lucrătoare).
    if (!rows[0] || rows[0].day < today) {
      try { await fetchRatesIntoCache(supabaseAdmin.from("exchange_rates") as never, today); rows = await read(); }
      catch (e) { console.warn("[home eur rate]", e instanceof Error ? e.message : "failed"); }
    }
    // Golul dintre ultimele două cursuri e mai mare de 4 zile: completăm din fluxul BNR pe 10 zile.
    const gapDays = rows[0] && rows[1] ? (Date.parse(rows[0].day) - Date.parse(rows[1].day)) / 86_400_000 : 99;
    if (rows[0] && gapDays > 4) {
      for (const url of bnrFeedUrls(Number(today.slice(0, 4))).filter((u) => u.includes("10days"))) {
        try {
          const res = await fetch(url, { headers: { Accept: "application/xml" } });
          const parsed = res.ok ? parseBnrYearXml(await res.text()) : [];
          if (!parsed.length) continue;
          await supabaseAdmin.from("exchange_rates").upsert(parsed.map((r) => ({ day: r.day, eur_ron: r.eurRon, source: "BNR" })));
          rows = await read();
          break;
        } catch (e) { console.warn("[home eur rate 10 days]", e instanceof Error ? e.message : "failed"); }
      }
    }
    if (!rows[0]) return null;
    return { day: rows[0].day, rate: Number(rows[0].eur_ron), previous: rows[1] ? Number(rows[1].eur_ron) : null, previousDay: rows[1]?.day ?? null };
  });
