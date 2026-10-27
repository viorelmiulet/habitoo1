import { it } from "vitest";
import { writeFileSync } from "fs";
import { __acpDryRun } from "./acp/analyses.functions";
import { haversineKm } from "./acp/scoring";
it("dry", async () => {
  const out: Record<string, unknown> = {};
  for (const id of ["13694819-e365-42c9-aca3-7964199dfb0a", "07ac311c-5a16-447e-a408-b1593bf15f7b"]) {
    for (const v of [3, 4]) {
      const { subject, result } = await __acpDryRun(id, v);
      out[`${id}:${v}`] = {
        complex: subject.complex, est: result.estimate.estimatedValue, used: result.comparablesUsed, found: result.candidatesFound,
        median: result.statistics.medianPricePerSqm, sanity: result.sanityCheck ?? null,
        comps: result.comparables.filter((c) => c.isSelected).map((c) => ({ t: c.title.slice(0, 60), loc: c.locationLabel, src: c.sourceName, score: c.similarityScore, locS: c.components.location, tier: c.tier, ppsm: c.adjustedPricePerSqm, km: haversineKm(subject, c.subject), rooms: c.subject.rooms, cx: c.subject.complex })),
      };
    }
  }
  writeFileSync("/tmp/acp/dry.json", JSON.stringify(out, null, 1));
}, 120000);
