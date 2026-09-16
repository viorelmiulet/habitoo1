import { decryptPortalCredential } from "@/lib/portals/crypto.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
const ORG = process.env["ORG"]!;
const { data: conn } = await supabaseAdmin.from("portal_connections").select("*").eq("organization_id", ORG).eq("portal","lacheie").maybeSingle();
const key = decryptPortalCredential((conn as any).portal_credentials_encrypted)!;
const base = "https://api.lacheie.ro/api/partners/v1";
const offer: Record<string, unknown> = {
  external_id: "HBT-PROBE-1564cc61-SALE",
  title: "Apartament test",
  description: "Anunt de test pentru validarea integrarii Habitoo CRM. Nu este un anunt real.",
  price: 50000, currency: "EUR", transaction_type: "sale",
  property_type: "1", county: "217", city: "25914",
  apartment_type: "apartment",
  agent: { external_id: "196ade29-b9fa-4f0e-ab84-5166a2f36770", full_name: "Test conexiune api", phone: "0700000001", email: "mvaperfectbusiness@gmail.com" },
  area: 50, bedrooms: 1, bathrooms: 1, year_built: 2016, number_of_rooms: 2,
  neighbourhood: "Militari", floor: 1,
  latitude: 44.434727, longitude: 25.987173,
  comfort: "comfort_1", partitioning: "decomandat", construction_stage: "2011_2019",
  pet_friendly: "not_allowed",
  heating: 1, cooling: 1, parking: 2, utilities: [1, 2, 3, 4, 6],
  images: ["https://crm.habitoo.ro/api/public/sites/v1/media/938d1ca4-e951-4004-b300-341dbf5b01b5"],
};
const res = await fetch(`${base}/properties`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", "X-Source-Version": "1" }, body: JSON.stringify(offer) });
console.log("STATUS", res.status);
console.log((await res.text()).slice(0, 2500));
