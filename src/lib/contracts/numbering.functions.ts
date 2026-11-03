import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { NUMBERED_CONTRACT_KINDS } from "./numbering";

export const getContractNumberSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("contract_number_series").select("kind,series,next_number");
    if (error) throw new Error("Numerotarea contractelor nu a putut fi citită.");
    return data ?? [];
  });

export const saveContractNumberSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    kind: z.enum(NUMBERED_CONTRACT_KINDS),
    series: z.string().trim().max(20).refine((s) => !/[\x00-\x1f\x7f]/.test(s), "Seria conține caractere nepermise."),
    nextNumber: z.number().int().min(1).max(2147483646),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("save_contract_number_series", {
      _kind: data.kind, _series: data.series, _next_number: data.nextNumber,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });