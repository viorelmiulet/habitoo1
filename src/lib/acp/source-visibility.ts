import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AcpReportModel } from "./report/model";

/** Fail closed, using the authenticated caller's role RPC (never user metadata). */
export async function canReadAcpSourceDiagnostics(context: {
  userId: string;
  supabase: SupabaseClient<Database>;
}): Promise<boolean> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "superadmin",
  });
  return !error && data === true;
}

/** Presentation only: keep the frozen calculation and comparable provenance intact. */
export function agencyAcpReport(model: AcpReportModel): AcpReportModel {
  return {
    ...model,
    sources: [],
    market: model.market ? {
      ...model.market,
      rows: model.market.rows.filter(row => ![
        "Surse de piață", "Prospețimea datelor de piață", "Ultima sincronizare",
      ].includes(row.label)),
    } : null,
  };
}