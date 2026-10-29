import { describe, expect, it } from "vitest";
import { runPortalPublishWorker, type PublishJobRow } from "../publish-jobs.server";
import { runZonataLoggedJob } from "./job-log.server";

function harness() {
  const logs: any[] = [];
  const job: PublishJobRow = { id: "j", organization_id: "org", property_id: "p", portal_key: "zonata", requested_by: "u", enabled: true, promoted: null, sync_existing: true, superadmin: true, attempts: 2 };
  let claimed = false;
  const admin = {
    rpc: async () => { if (claimed) return { data: [] }; claimed = true; return { data: [job] }; },
    from: (table: string) => {
      let patch: any;
      const filters: [string, unknown][] = [];
      const q: any = {
        update: (value: unknown) => { patch = value; return q; },
        eq: (key: string, value: unknown) => { filters.push([key, value]); return q; },
        insert: (row: any) => { if (table === "portal_operation_logs") logs.push({ id: `l${logs.length}`, ...row }); return q; },
        select: () => q, single: async () => ({ data: logs.at(-1), error: null }),
        then: (resolve: any) => { if (table === "portal_operation_logs" && patch) for (const row of logs.filter(row => filters.every(([key, value]) => row[key] === value))) Object.assign(row, patch); return resolve({ error: null }); },
      };
      return q;
    },
  };
  return { admin, job, logs };
}

describe("ZonaTa durable attempt logging", () => {
  it("writes evidence before preflight and finalizes catchable unexpected errors", async () => {
    const h = harness();
    await expect(runZonataLoggedJob(h.admin, h.job, async () => {
      expect(h.logs[0]).toMatchObject({ success: false, error_code: "OPERATION_PENDING" });
      throw new Error("private provider data");
    })).rejects.toThrow("private provider data");
    expect(h.logs[0]).toMatchObject({ success: false, error_code: "UNEXPECTED_ERROR" });
    expect(h.logs[0].error_message).not.toContain("private provider data");
  });
  it("marks interrupted attempts on reclaim and preserves a timeout failure", async () => {
    const h = harness();
    h.logs.push({ id: "old", organization_id: "org", property_id: "p", portal: "zonata", error_code: "OPERATION_PENDING" });
    await runZonataLoggedJob(h.admin, h.job, async () => ({ portalId: "zonata", ok: false, code: "TIMEOUT", message: "ZonaTa nu a răspuns în 90 de secunde." }));
    expect(h.logs[0].error_code).toBe("INTERRUPTED");
    expect(h.logs[1]).toMatchObject({ success: false, error_code: "TIMEOUT", duration_ms: expect.any(Number) });
  });
  it("the real queue wrapper logs ZonaTa errors and finalizes the job", async () => {
    const h = harness();
    const result = await runPortalPublishWorker(h.admin, async () => { throw new Error("preflight failed"); });
    expect(result.failed).toBe(1);
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0].error_code).toBe("UNEXPECTED_ERROR");
  });
  it("does not change other portal logging", async () => {
    const h = harness();
    h.job.portal_key = "imopedia";
    await runPortalPublishWorker(h.admin, async () => ({ portalId: "imopedia", ok: true, message: null }));
    expect(h.logs).toHaveLength(0);
  });
});