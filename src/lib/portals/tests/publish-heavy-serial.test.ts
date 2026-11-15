import { describe, expect, it } from "vitest";
import { HEAVY_PUBLISH_PORTALS, runPortalPublishWorker, type PublishJobRow } from "../publish-jobs.server";

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

describe("IM3: photo-heavy publish jobs never run in parallel", () => {
  it("runs at most one heavy job per run while feed jobs stay parallel", async () => {
    const heavy = ["imobiliare_ro", "vumsi", "homedirect"];
    const feeds = ["clickimob", "imobli", "locuit", "imobiliaremilitari", "bazaruldecase"];
    const { admin, queue } = makeAdmin([...heavy, ...feeds]);
    let heavyNow = 0, heavyMax = 0, feedNow = 0, feedMax = 0;
    const ran: string[] = [];
    await runPortalPublishWorker(admin, async (job) => {
      const isHeavy = HEAVY_PUBLISH_PORTALS.includes(job.portal_key);
      if (isHeavy) heavyMax = Math.max(heavyMax, ++heavyNow); else feedMax = Math.max(feedMax, ++feedNow);
      await new Promise((r) => setTimeout(r, isHeavy ? 30 : 10));
      if (isHeavy) heavyNow--; else feedNow--;
      ran.push(job.portal_key);
      return { portalId: job.portal_key, ok: true, action: "published" } as never;
    }, { budgetMs: 5_000 });
    expect(heavyMax).toBe(1);
    expect(feedMax).toBeGreaterThan(1);
    expect(ran.filter((k) => heavy.includes(k))).toHaveLength(1);
    expect(feeds.every((k) => ran.includes(k))).toBe(true);
    // The two remaining heavy jobs stay queued for later runs.
    expect(queue.map((j) => j.portal_key).sort()).toEqual(heavy.filter((k) => ran.indexOf(k) < 0).sort());
  });

  it("consecutive runs process the remaining heavy jobs one at a time", async () => {
    const { admin, queue } = makeAdmin(["imobiliare_ro", "vumsi", "homedirect"]);
    let now = 0, max = 0;
    for (let run = 0; run < 3; run++) {
      await runPortalPublishWorker(admin, async (job) => {
        max = Math.max(max, ++now); await new Promise((r) => setTimeout(r, 5)); now--;
        return { portalId: job.portal_key, ok: true, action: "published" } as never;
      }, { budgetMs: 5_000 });
    }
    expect(max).toBe(1);
    expect(queue).toHaveLength(0);
  });

  it("lists every photo-uploading portal named in the incident", () => {
    for (const key of ["imobiliare_ro", "vumsi", "homedirect", "storia", "vdi", "homepitch"]) expect(HEAVY_PUBLISH_PORTALS).toContain(key);
    expect(HEAVY_PUBLISH_PORTALS).not.toContain("clickimob");
  });
});
