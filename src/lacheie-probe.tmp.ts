import { decryptPortalCredential } from "@/lib/portals/crypto.server";
import { readLaCheieCatalog, refreshLaCheieCatalog } from "@/lib/portals/lacheie/catalog.server";
import { buildLaCheiePayload } from "@/lib/portals/lacheie/payload.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LACHEIE_PRODUCTION_BASE_URL } from "@/lib/portals/lacheie/config";

const ORG = process.env["ORG"]!;
const { data: conn } = await supabaseAdmin
  .from("portal_connections").select("*").eq("organization_id", ORG).eq("portal", "lacheie").maybeSingle();
const apiKey = decryptPortalCredential((conn as any).portal_credentials_encrypted)!;
const base = LACHEIE_PRODUCTION_BASE_URL;
console.log("base:", base, "key len:", apiKey.length);

const config = { baseUrl: base, apiKey, environment: "production" as const, connectionKey: `${ORG}:production` };
let catalog = await readLaCheieCatalog(supabaseAdmin as any, { organizationId: ORG, environment: "production" });
if (!catalog) {
  const r = await refreshLaCheieCatalog(supabaseAdmin as any, config as any, { organizationId: ORG, environment: "production", actorId: null });
  console.log("catalog refresh:", r.ok ? "ok" : r.message);
  if (r.ok) catalog = r.catalog;
}
const propertyId = process.env["PROP"]!;
const build = await buildLaCheiePayload({ organizationId: ORG, propertyId, catalog: catalog! });
if (!build.ok) { console.log("BUILD FAILED", build.reasons); process.exit(0); }
const offer = build.offers[0]!.offer;
console.log("PAYLOAD:", JSON.stringify(offer, null, 2).slice(0, 4000));

const res = await fetch(`${base}/properties`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify(offer),
});
console.log("STATUS", res.status);
console.log("BODY", (await res.text()).slice(0, 4000));
