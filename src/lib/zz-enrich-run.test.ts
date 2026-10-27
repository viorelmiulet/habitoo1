import { it } from "vitest";
import { writeFileSync } from "fs";
it("run50", async () => {
  const { supabaseAdmin: a } = await import("@/integrations/supabase/client.server");
  const pick = async (q: (x: any) => any, n: number) => ((await q(a.from("market_listings").select("id").eq("status", "active")).limit(n)).data ?? []).map((r: any) => r.id);
  const ids = new Set<string>([
    ...(await pick((q) => q.ilike("title", "%militari%").eq("transaction_type", "sale"), 15)),
    ...(await pick((q) => q.eq("normalized_city", "chiajna"), 10)),
    ...(await pick((q) => q.ilike("title", "%garsonier%"), 15)),
    ...(await pick((q) => q.eq("transaction_type", "sale").order("first_seen_at", { ascending: false }), 25)),
  ]);
  const list = [...ids].slice(0, 50);
  const { runAcpEnrichment } = await import("./acp/enrichment.server");
  const r = await runAcpEnrichment(a, { mode: "backlog", listingIds: list, limit: 50 });
  const { data: rows } = await a.from("market_listings").select("id,title,address,neighborhood,city,property_type,transaction_type,price,currency,usable_area,rooms,floor").in("id", list);
  writeFileSync("/tmp/enrich/run.json", JSON.stringify({ r, rows }, null, 1));
}, 580000);
