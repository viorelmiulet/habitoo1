import { storiaAdapter } from "../src/lib/portals/adapters/storia.server";
import { readAdvertMeta } from "../src/lib/portals/storia/adverts.server";
const organizationId = "04041622-b3d2-4cbe-a214-2ae9bfa34492";
const propertyId = "13e713e9-9066-412f-afac-2306b042d5b8";
const ctx: any = { organizationId, allowLiveRequests: true, settings: {}, portalCredential: "x" };
const res = await storiaAdapter.publishListing(ctx, { propertyId, externalId: "SALE:073b754d-040a-4c66-8959-b1c8d74289f1" } as any);
console.log(JSON.stringify(res, null, 2));
const m = await readAdvertMeta(organizationId, "073b754d-040a-4c66-8959-b1c8d74289f1");
console.log("meta after:", m?.code, m?.visibleInProfile, m?.url);
