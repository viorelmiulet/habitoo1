import { writeFileSync } from "fs";
const { buildProperstarFeed } = await import("./src/lib/portals/properstar/feed.server.ts");
const b = await buildProperstarFeed({ organizationId: "04041622-b3d2-4cbe-a214-2ae9bfa34492", requestUrl: "https://crm.habitoo.ro/x" });
writeFileSync("/tmp/ps/feed.xml", b.xml);
console.log(JSON.stringify({ selected: b.selected, included: b.adverts.length, active: b.active, excluded: b.excluded.length, excludedReasons: b.excluded.map((e:any)=>e.reference+": "+e.missing.join("; ")), agencyPostalUsed: b.agencyPostalUsed?.length }));
process.exit(0);
