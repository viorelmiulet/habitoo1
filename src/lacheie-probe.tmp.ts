import { decryptPortalCredential } from "@/lib/portals/crypto.server";
import { readLaCheieCatalog } from "@/lib/portals/lacheie/catalog.server";
import { buildLaCheiePayload } from "@/lib/portals/lacheie/payload.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ORG = process.env["ORG"]!;
const { data: conn } = await supabaseAdmin.from("portal_connections").select("*").eq("organization_id", ORG).eq("portal","lacheie").maybeSingle();
const key = decryptPortalCredential((conn as any).portal_credentials_encrypted)!;
const base = "https://api.lacheie.ro/api/partners/v1";
const catalog = await readLaCheieCatalog(supabaseAdmin as any, { organizationId: ORG, environment: "production" });
const build = await buildLaCheiePayload({ organizationId: ORG, propertyId: process.env["PROP"]!, catalog: catalog! });
if (!build.ok) { console.log("BUILD FAILED", build.reasons); process.exit(0); }
const offer: Record<string, unknown> = { ...(build.offers[0]!.offer as any) };

for (let round = 1; round <= 10; round += 1) {
  const res = await fetch(`${base}/properties`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", "X-Source-Version": String(round) },
    body: JSON.stringify(offer),
  });
  const text = await res.text();
  console.log(`--- round ${round}: HTTP ${res.status}`);
  console.log(text.slice(0, 1500));
  if (res.status !== 400 && res.status !== 422) break;
  let fields: Record<string, unknown> = {};
  try { fields = JSON.parse(text).error?.fields ?? {}; } catch { break; }
  const unknown = Object.entries(fields)
    .filter(([, v]) => JSON.stringify(v).includes("Unknown field"))
    .map(([k]) => k);
  if (unknown.length === 0) break;
  console.log("elimin câmpurile necunoscute:", unknown.join(", "));
  for (const field of unknown) delete offer[field.split(".")[0]!];
}
