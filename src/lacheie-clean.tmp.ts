import { decryptPortalCredential } from "@/lib/portals/crypto.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
const ORG = process.env["ORG"]!;
const { data: conn } = await supabaseAdmin.from("portal_connections").select("*").eq("organization_id", ORG).eq("portal","lacheie").maybeSingle();
const key = decryptPortalCredential((conn as any).portal_credentials_encrypted)!;
const res = await fetch("https://api.lacheie.ro/api/partners/v1/properties/HBT-PROBE-1564cc61-SALE", {
  method: "DELETE",
  headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "X-Source-Version": "2" },
});
console.log("STATUS", res.status, (await res.text()).slice(0, 400));
