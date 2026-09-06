import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { decryptPortalCredential } from "../src/lib/portals/crypto.server";
const { data } = await supabaseAdmin.from("portal_connections").select("portal_credentials_encrypted").eq("portal","imove").maybeSingle();
const k = decryptPortalCredential((data as any)!.portal_credentials_encrypted);
console.log("keylen", k?.length);
for (const ext of ["json","csv"]) {
  const r = await fetch(`http://localhost:8080/api/public/portal/v1/imove/feed.${ext}?api_key=${encodeURIComponent(k!)}`);
  console.log(ext, r.status, (await r.text()).slice(0,150));
}
