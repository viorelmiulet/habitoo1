import { STORIA_TAXONOMY_SNAPSHOT as S } from "./src/lib/portals/storia/taxonomy-snapshot";
for (const [urn, spec] of Object.entries(S)) {
  console.log("\n=== " + urn + " ===");
  for (const a of spec.attributes) {
    console.log(` ${a.code} [${a.type}]${a.mandatory ? " MANDATORY" : ""}${a.values.length ? " => " + a.values.map(v=>v.replace("urn:concept:","")).join(",") : ""}`);
  }
}
