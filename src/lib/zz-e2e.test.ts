import { it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { matchRequestProperty } from "@/lib/social-requests";
import { parsePlaceChoices } from "@/lib/search-places";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ORG = "f255a149-456c-48bc-a6d7-6219741cfe0d", USER = "3dcd63f5-12e2-405e-be05-a6ca3e28733e";
it("e2e", async () => {
  const ids = (r: any) => (r.data ?? []).map((x: any) => x.external_id).filter((x: string) => x.startsWith("habitoo-test")).sort().join(",");
  const militari = [{ kind: "zone", county: "bucuresti", city: "bucuresti", zone: "militari" }];
  const chiajna = [{ kind: "city", county: "ilfov", city: "chiajna", zone: "" }];
  console.log("Militari:", ids(await sb.rpc("search_social_requests_places", { _choices: militari }).select("external_id")));
  console.log("Militari+Chiajna:", ids(await sb.rpc("search_social_requests_places", { _choices: [...militari, ...chiajna] }).select("external_id")));
  console.log("Drumul Taberei:", ids(await sb.rpc("search_social_requests_places", { _choices: [{ kind: "zone", county: "bucuresti", city: "bucuresti", zone: "drumul taberei" }] }).select("external_id")));
  console.log("Ilfov judet:", ids(await sb.rpc("search_social_requests_places", { _choices: [{ kind: "county", county: "ilfov", city: "", zone: "" }] }).select("external_id")));
  console.log("Închiriere:", ids(await sb.from("social_requests").select("external_id").eq("transaction_type", "inchiriere")));
  console.log("Buget 80-100k:", ids(await sb.from("social_requests").select("external_id").gte("budget_max", 80000).lte("budget_min", 100000)));
  console.log("Buget suprapus 80k max:", ids(await sb.from("social_requests").select("external_id").lte("budget_min", 80000)));
  const { data: reqs } = await sb.from("social_requests").select("*").like("external_id", "habitoo-test%").order("external_id");
  const { data: props } = await sb.from("properties").select("id,reference,title,status,publish_status,deleted_at,transaction_kind,property_type,rooms,price,currency,county,city,district").eq("organization_id", ORG).eq("status", "active").is("deleted_at", null);
  for (const r of reqs!) {
    const m = props!.flatMap(p => { const x = matchRequestProperty(r as any, { ...p, price: p.price === null ? null : Number(p.price) } as any); return x ? [`${p.reference} ${p.price}${p.currency} ${p.district} ${x.score}%`] : []; });
    console.log(r.external_id, "potriviri:", m.length, m.slice(0, 4));
  }
  void parsePlaceChoices;
}, 30000);
