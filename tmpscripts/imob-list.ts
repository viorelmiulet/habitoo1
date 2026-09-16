import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { getImobiliareSession, imobiliareAuthedRequest } from "../src/lib/portals/imobiliare/auth.server";
import { decryptPortalCredential } from "../src/lib/portals/crypto.server";
const db = supabaseAdmin;
const { data: conns } = await db.from("portal_connections").select("*").eq("portal","imobiliare_ro");
const c = conns![0] as any;
const s = await getImobiliareSession({ admin: db, organizationId: c.organization_id, username: c.external_account_id, credential: decryptPortalCredential(c.portal_credentials_encrypted) });
if (!s.ok) { console.log("fail", s); process.exit(1); }
for (const p of ["/api/v3/listings", "/api/v3/listings/HB-1006/promotions"]) {
  const r = await imobiliareAuthedRequest(s.session, { method: "GET", path: p, connectionKey: c.organization_id });
  console.log("==", p, r.status);
  console.log(JSON.stringify(r.body).slice(0, 1500));
}
