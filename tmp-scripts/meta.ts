import { olxAuthorizedRequest } from "../src/lib/portals/storia/oauth.server";
const org = "04041622-b3d2-4cbe-a214-2ae9bfa34492";
const uuid = "073b754d-040a-4c66-8959-b1c8d74289f1";
const res = await olxAuthorizedRequest(org, "GET", `/advert/v1/${uuid}/meta`);
console.log(res.status, res.raw);
