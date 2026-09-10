import { olxAuthorizedRequest } from "../src/lib/portals/storia/oauth.server";
const org = "04041622-b3d2-4cbe-a214-2ae9bfa34492";
const uuid = "073b754d-040a-4c66-8959-b1c8d74289f1";
const a = await olxAuthorizedRequest(org, "POST", `/advert/v1/${uuid}/activate`);
console.log("activate:", a.status, a.raw);
await new Promise(r => setTimeout(r, 6000));
const m = await olxAuthorizedRequest(org, "GET", `/advert/v1/${uuid}/meta`);
console.log("meta:", m.raw);
