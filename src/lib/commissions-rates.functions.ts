import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRonEurRateForDate } from "@/lib/commissions-rates.server";
import { z } from "zod";

/** Cursul BNR RON/EUR din ziua tranzacției (sau ultima zi lucrătoare anterioară). */
export const getRonEurRate = createServerFn({ method: "GET" })
  .inputValidator((data: { date: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.date ?? "")) throw new Error("Data este invalidă");
    return data;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return getRonEurRateForDate(data.date, { table: supabaseAdmin.from("exchange_rates") });
  });

/** Only missing rates on caller-readable commissions; never accepts a client rate. */
export const ensureCommissionRates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("commissions")
      .select("id,transaction_date,ron_to_eur_rate").in("id", data.ids);
    if (error) throw error;
    if (!rows?.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const date of new Set(rows.filter(r => !r.ron_to_eur_rate).map(r => r.transaction_date))) {
      const rate = await getRonEurRateForDate(date, { table: supabaseAdmin.from("exchange_rates") });
      const ids = rows.filter(r => r.transaction_date === date && !r.ron_to_eur_rate).map(r => r.id);
      const { error: updateError } = await supabaseAdmin.from("commissions")
        .update({ ron_to_eur_rate: rate.rate }).in("id", ids).eq("transaction_date", date).is("ron_to_eur_rate", null);
      if (updateError) throw updateError;
    }
    const { data: saved, error: readError } = await context.supabase.from("commissions").select("id,ron_to_eur_rate").in("id", data.ids);
    if (readError) throw readError;
    return saved ?? [];
  });
