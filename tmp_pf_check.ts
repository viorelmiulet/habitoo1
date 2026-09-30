import { computeOrgPortalStates, getPropertiesPortalMatrix } from "@/lib/portals/../portals.functions";
import { portalStateBucket } from "@/lib/portals/portal-state";
const org="8234eb6c-754f-434f-8ea9-cde7f5a2dddd";
const m=await computeOrgPortalStates(org);
const counts:Record<string,Record<string,number>>={};
const any={published:0,unpublished:0,error:0};
for(const [,cells] of m){const b=cells.map(c=>portalStateBucket(c.state));
 if(b.includes("published"))any.published++; else any.unpublished++; if(b.includes("error"))any.error++;
 for(const c of cells){(counts[c.portalId]??={published:0,unpublished:0,error:0})[portalStateBucket(c.state)]++;}}
console.log("total",m.size);console.log(JSON.stringify(counts,null,1));console.log("any",any);
const sample=[...m.entries()].filter(([,c])=>c.some(x=>x.state!=="not_selected")).slice(0,3);
console.log(JSON.stringify(sample.map(([id,c])=>[id,c.map(x=>x.portalId+":"+x.state)])));
