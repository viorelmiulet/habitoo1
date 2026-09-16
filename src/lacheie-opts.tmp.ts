import { decryptPortalCredential } from "@/lib/portals/crypto.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
const ORG = process.env["ORG"]!;
const { data: conn } = await supabaseAdmin.from("portal_connections").select("*").eq("organization_id", ORG).eq("portal","lacheie").maybeSingle();
const key = decryptPortalCredential((conn as any).portal_credentials_encrypted)!;
const r = await fetch("https://api.lacheie.ro/api/partners/v1/options", { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
const text = await r.text();
console.log("STATUS", r.status, "len", text.length);
console.log(text.slice(0, 6000));
