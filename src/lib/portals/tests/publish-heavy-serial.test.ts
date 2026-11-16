import { describe, expect, it } from "vitest";
import { HEAVY_PUBLISH_PORTALS, MAX_PARALLEL_HEAVY, runPortalPublishWorker, type PublishJobRow } from "../publish-jobs.server";

function makeAdmin(keys: string[]) {
  const queue = keys.map((portal_key, i) => ({ id: `j${i}`, portal_key, organization_id: "o", property_id: "p",
    requested_by: "u", superadmin: false, attempts: 0, operation: "apply" } as unknown as PublishJobRow));
  const claims: { got: string | null; excluded: boolean }[] = [];
  const admin = {
    rpc: async (name: string, args: { _exclude_portals?: string[] }) => {
      if (name !== "claim_portal_publish_jobs") return { data: null, error: null };
      await new Promise((r) => setTimeout(r, 1));
      const idx = queue.findIndex((j) => !args._exclude_portals?.includes(j.portal_key));
      const job = idx >= 0 ? queue.splice(idx, 1)[0]! : null;
      claims.push({ got: job?.portal_key ?? null, excluded: !!args._exclude_portals });
      return { data: job ? [job] : [], error: null };
    },
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }) }),
  };
  return { admin, queue, claims };
}

describe("IM7: heavy jobs are capped in flight, not per run", () => {
  it("one run processes all 10 heavy jobs with concurrency <= MAX_PARALLEL_HEAVY", async () => {
    const heavy = Array.from({ length: 10 }, (_, i) => ["imobiliare_ro", "vumsi", "primulanunt"][i % 3]!);
    const light = Array.from({ length: 10 }, (_, i) => ["homedirect", "homepitch", "clickimob", "storia", "locuit"][i % 5]!);
    const { admin, queue } = makeAdmin([...heavy, ...light]);
    let heavyNow = 0, heavyMax = 0, heavyDone = 0, lightDone = 0;
    await runPortalPublishWorker(admin, async (job) => {
      const isHeavy = HEAVY_PUBLISH_PORTALS.includes(job.portal_key);
      if (isHeavy) heavyMax = Math.max(heavyMax, ++heavyNow);
      await new Promise((r) => setTimeout(r, isHeavy ? 15 : 5));
      if (isHeavy) { heavyNow--; heavyDone++; } else lightDone++;
      return { portalId: job.portal_key, ok: true, action: "published" } as never;
    }, { budgetMs: 10_000 });
    expect(MAX_PARALLEL_HEAVY).toBe(2);
    expect(heavyDone).toBe(10);
    expect(lightDone).toBe(10);
    expect(heavyMax).toBeLessThanOrEqual(MAX_PARALLEL_HEAVY);
    expect(queue).toHaveLength(0);
  });

  it("only byte-processing portals are heavy", () => {
    expect([...HEAVY_PUBLISH_PORTALS].sort()).toEqual(["imobiliare_ro", "primulanunt", "vumsi"]);
  });
});
