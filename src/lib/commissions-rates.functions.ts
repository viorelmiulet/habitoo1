import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRonEurRateForDate } from "@/lib/commissions-rates.server";

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
