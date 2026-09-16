import { executeListingAction } from "@/lib/portals.functions";
const r = await executeListingAction({
  organizationId: process.env["ORG"]!,
  actorId: null,
  portalId: "lacheie",
  propertyId: process.env["PROP"]!,
  action: "publish",
});
console.log(JSON.stringify(r, null, 2));
