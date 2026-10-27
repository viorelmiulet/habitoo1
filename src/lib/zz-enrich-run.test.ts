import { it } from "vitest";
import { readFileSync, writeFileSync } from "fs";
it("run50", async () => {
  const { supabaseAdmin: a } = await import("@/integrations/supabase/client.server");
  const list = JSON.parse(readFileSync("/tmp/enrich/ids.json", "utf8"));
  const { runAcpEnrichment } = await import("./acp/enrichment.server");
  const r = await runAcpEnrichment(a, { mode: "backlog", listingIds: list, limit: 50 });
  const { data: rows } = await a.from("market_listings").select("id,title,address,neighborhood,city,property_type,transaction_type,price,currency,usable_area,rooms,floor,raw_data").in("id", list);
  writeFileSync("/tmp/enrich/run2.json", JSON.stringify({ r, rows }, null, 1));
}, 580000);
