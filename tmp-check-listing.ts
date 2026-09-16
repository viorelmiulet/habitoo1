import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getImobiliareSession, imobiliareAuthedRequest } from "@/lib/portals/imobiliare/auth.server";
import { IMOBILIARE_PATHS } from "@/lib/portals/imobiliare/config";

const ORG = process.argv[2];
const REF = process.argv[3] ?? "HB-1006";

const { data: conn } = await supabaseAdmin
  .from("portal_connections")
  .select("organization_id, external_account_id, portal_credentials_encrypted")
  .eq("portal", "imobiliare_ro")
  .eq("organization_id", ORG)
  .maybeSingle();
if (!conn) throw new Error("no connection");

const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
const credential = decryptPortalCredential((conn as any).portal_credentials_encrypted);
const session = await getImobiliareSession({
  admin: supabaseAdmin as never,
  organizationId: ORG,
  username: (conn as any).external_account_id,
  credential,
});
if (!session.ok) throw new Error(session.message);

const res = await imobiliareAuthedRequest(session.session, {
  method: "GET",
  path: `${IMOBILIARE_PATHS.listings}/${REF}`,
  connectionKey: ORG,
});
console.log("status", res.status);
console.log(JSON.stringify(res.body, null, 2).slice(0, 6000));
