import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const worker = vi.fn(async () => ({ processed: 2 }));
vi.mock("@/integrations/supabase/cron-auth", () => ({ authenticateCronRequest: async () => null }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: vi.fn() } }));
vi.mock("@/lib/portals/publish-jobs.server", () => ({ runPortalPublishWorker: worker }));
vi.mock("@/lib/portals.functions", () => ({ applyPortalSelectionForOrg: vi.fn(), executeListingAction: vi.fn() }));
vi.mock("@/lib/portals/republish.server", () => ({ runRepublishJob: vi.fn(), refreshRepublishBatches: async () => undefined }));
vi.mock("@/lib/portals/relay-health.server", () => ({ recoverPortalRelay: async () => undefined }));
vi.mock("@/lib/portals/lacheie/recovery.server", () => ({ recoverLaCheieImageLimitJobs: async () => undefined }));
vi.mock("@/lib/portals/storia/development.server", () => ({ runDevelopmentWorker: async () => undefined }));

describe("portal_publish_kick", () => {
  it("migrarea setează timeout_milliseconds la 150000", () => {
    const sql = readFileSync("drizzle/migrations/0337_portal_publish_kick_timeout.sql", "utf8");
    expect(sql).toMatch(/FUNCTION public\.portal_publish_kick\(\)/);
    expect(sql).toMatch(/timeout_milliseconds\s*:=\s*150000/);
  });
});

describe("/api/public/cron/portal-publish", () => {
  it("pornește workerul cu waitUntil și întoarce același răspuns", async () => {
    const { runWithRequestContext } = await import("@/lib/after-response");
    const { Route } = await import("@/routes/api/public/cron/portal-publish");
    const waitUntil = vi.fn();
    const post = (Route.options.server as any).handlers.POST;
    const res: Response = await runWithRequestContext({ waitUntil }, () =>
      post({ request: new Request("http://x/api/public/cron/portal-publish", { method: "POST" }) }),
    );
    expect(worker).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ ok: true, processed: 2 });
  });
});
