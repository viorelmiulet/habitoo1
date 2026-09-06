import { handlePropertiesList } from "@/lib/site-feed/handlers.server";
const org = "04041622-b3d2-4cbe-a214-2ae9bfa34492";
const auth = (portal: string | null) => ({ ok: true as const, organizationId: org, tokenId: "t", tokenPrefix: "t", source: "portal_key" as const, portal, scopes: ["feed:read"] });
for (const p of ["clickimob", "imove", null]) {
  const r = await handlePropertiesList(new Request("https://crm.habitoo.ro/api/public/portal/v1/properties?page=1&per_page=50"), auth(p));
  const body: any = await r.response.json();
  console.log(p, r.response.status, "total", body.total, (body.data ?? []).map((d: any) => d.idstr));
}
