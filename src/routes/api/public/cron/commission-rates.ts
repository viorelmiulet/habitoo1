import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { completeMissingCommissionRates, getRonEurRateForDate } from "@/lib/commissions-rates.server";

export const Route = createFileRoute("/api/public/cron/commission-rates")({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let updated = 0;
    let cursor: string | undefined;
    // Keyset pagination keeps completeness when successful writes leave the missing set.
    const resolved = new Map<string, number | null>();
    for (;;) {
      let query = supabaseAdmin.from("commissions").select("id,transaction_date,ron_to_eur_rate")
        .is("ron_to_eur_rate", null).order("id").limit(500);
      if (cursor) query = query.gt("id", cursor);
      const { data: rows, error } = await query;
      if (error) throw error;
      if (!rows?.length) break;
      updated += await completeMissingCommissionRates(rows, {
        resolve: async date => {
          if (!resolved.has(date)) {
            const result = await getRonEurRateForDate(date, { table: supabaseAdmin.from("exchange_rates") }).catch(() => null);
            resolved.set(date, result?.rate ?? null);
          }
          const rate = resolved.get(date);
          if (rate == null) throw new Error("BNR indisponibil");
          return { rate };
        },
        update: async (ids, date, rate) => {
          const { error } = await supabaseAdmin.from("commissions").update({ ron_to_eur_rate: rate })
            .in("id", ids).eq("transaction_date", date).is("ron_to_eur_rate", null);
          if (error) throw error;
        },
      });
      cursor = rows[rows.length - 1]?.id;
      if (rows.length < 500) break;
    }
    return Response.json({ ok: true, updated });
  } } },
});