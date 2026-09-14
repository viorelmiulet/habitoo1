import { createClient } from "@supabase/supabase-js";
import { computeMarketIntelligence } from "../src/lib/market/intelligence.server";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const res = await computeMarketIntelligence(admin as never, { status: "active" });
console.log("totalMatched", res.aggregate.totalMatched);
console.log("median ppsm", res.aggregate.pricePerSqm.median);
console.log("insufficient", res.aggregate.insufficient, res.aggregate.insufficientReason);
console.log("trend", res.trend?.available, res.trend?.reason);
console.log("sources", res.sources.map((s) => `${s.id}:${s.configured}:${s.recordsTotal}`).join(", "));
