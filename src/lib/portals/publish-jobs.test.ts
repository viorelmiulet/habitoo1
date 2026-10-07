/** Coada durabilă de publicare — doar simulare, fără portaluri reale. */
import { describe, expect, it, vi } from "vitest";
import {
  decideJobResult,
  runPortalPublishWorker,
  type PublishJobRow,
} from "./publish-jobs.server";
import { enqueuePublishJobsForOrg } from "./publish-enqueue.server";

vi.mock("./slots.server", () => ({ ensurePortalSlotAvailable: async () => ({ ok: true }) }));

type Job = PublishJobRow & {
  status: string;
  locked_at: string | null;
  next_attempt_at: string;
  result_ok?: boolean | null;
  result_message?: string | null;
};

function fakeDb(initial: Partial<Job>[] = []) {
  const jobs: Job[] = initial.map((j, i) => ({
    id: `job-${i}`,
    organization_id: "org",
    property_id: "prop",
    portal_key: `portal-${i}`,
    enabled: true,
    promoted: null,
    sync_existing: true,
    requested_by: "agent-1",
    superadmin: false,
    attempts: 0,
    status: "queued",
    locked_at: null,
    next_attempt_at: new Date(0).toISOString(),
    ...j,
  }));
  const notifications: unknown[] = [];
  const rpcs: string[] = [];
  const admin = {
    rpc: async (name: string, args: { _limit: number; _lease_seconds: number }) => {
      rpcs.push(name);
      if (name !== "claim_portal_publish_jobs") return { data: null, error: null };
      const now = Date.now();
      const due = jobs
        .filter(
          (j) =>
            (j.status === "queued" && Date.parse(j.next_attempt_at) <= now) ||
            (j.status === "running" &&
              j.locked_at !== null &&
              Date.parse(j.locked_at) < now - args._lease_seconds * 1000),
        )
        .slice(0, args._limit);
      for (const j of due) {
        j.status = "running";
        j.locked_at = new Date().toISOString();
        j.attempts += 1;
      }
      return { data: due.map((j) => ({ ...j })), error: null };
    },
    from: (table: string) => {
      if (table === "notifications")
        return { insert: async (row: unknown) => (notifications.push(row), { error: null }) };
      if (table === "portal_publications")
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: [] }) }) }) };
      return {
        insert: async (row: Job) => {
          if (
            jobs.some(
              (j) =>
                j.property_id === row.property_id &&
                j.portal_key === row.portal_key &&
                (j.status === "queued" || j.status === "running"),
            )
          )
            return { error: { code: "23505" } };
          jobs.push({
            ...row,
            id: `job-${jobs.length}`,
            attempts: 0,
            status: "queued",
            locked_at: null,
            next_attempt_at: new Date(0).toISOString(),
          } as Job);
          return { error: null };
        },
        update: (patch: Partial<Job>) => ({
          eq: async (_c: string, id: string) => {
            Object.assign(jobs.find((j) => j.id === id)!, patch);
            return { error: null };
          },
        }),
      };
    },
  };
  return { admin, jobs, notifications, rpcs };
}

const enqueueBase = (admin: unknown) => ({
  organizationId: "org",
  superadmin: true,
  actorId: "agent-1",
  loadAdmin: async () => admin,
  activatedPortalIds: async () => new Set<string>(),
});

describe("înscrierea joburilor", () => {
  it("înscrie fără să ruleze nimic pe portal și armează workerul", async () => {
    const db = fakeDb();
    const out = await enqueuePublishJobsForOrg({
      ...enqueueBase(db.admin),
      data: { propertyId: "prop", selections: [{ portalId: "clickimob", enabled: true }], syncExisting: true },
    });
    expect(out.results[0]?.queued).toBe(true);
    expect(db.jobs).toHaveLength(1);
    expect(db.jobs[0]?.status).toBe("queued");
    expect(db.rpcs).toEqual(["portal_publish_arm"]);
  });

  it("un singur job activ per proprietate + portal", async () => {
    const db = fakeDb();
    const input = {
      ...enqueueBase(db.admin),
      data: { propertyId: "prop", selections: [{ portalId: "clickimob", enabled: true }], syncExisting: true },
    };
    await enqueuePublishJobsForOrg(input);
    const second = await enqueuePublishJobsForOrg(input);
    expect(second.results[0]?.queued).toBe(false);
    expect(db.jobs).toHaveLength(1);
  });
});

describe("workerul", () => {
  it("preia joburile fără client, maxim 3 în paralel, cu actorul solicitantului", async () => {
    const db = fakeDb(Array.from({ length: 5 }, () => ({})));
    let active = 0;
    let peak = 0;
    const actors: string[] = [];
    const stats = await runPortalPublishWorker(db.admin, async (job) => {
      actors.push(job.requested_by);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return { portalId: job.portal_key, ok: true, action: "published", message: null };
    });
    expect(stats.done).toBe(5);
    expect(peak).toBe(3);
    expect(actors.every((a) => a === "agent-1")).toBe(true);
    expect(db.jobs.every((j) => j.status === "done")).toBe(true);
    // Publicările reușite nu creează nicio notificare.
    expect(db.notifications).toHaveLength(0);
  });

  it("reia un job cu lease expirat", async () => {
    const db = fakeDb([
      { status: "running", locked_at: new Date(Date.now() - 6 * 60_000).toISOString(), attempts: 1 },
      { status: "running", locked_at: new Date().toISOString(), attempts: 1 },
    ]);
    const seen: string[] = [];
    await runPortalPublishWorker(db.admin, async (job) => {
      seen.push(job.id);
      return { portalId: job.portal_key, ok: true, message: null };
    });
    expect(seen).toEqual(["job-0"]);
    expect(db.jobs[1]?.status).toBe("running");
  });

  it("izolează erorile: un portal eșuat nu le oprește pe celelalte", async () => {
    const db = fakeDb([{}, {}, {}]);
    await runPortalPublishWorker(db.admin, async (job) => {
      if (job.id === "job-1") throw new Error("Storia a respins validarea anunțului.");
      return { portalId: job.portal_key, ok: true, message: null };
    });
    expect(db.jobs.map((j) => j.status)).toEqual(["done", "error", "done"]);
    expect(db.jobs[1]?.result_message).toMatch(/validarea/);
    // Doar eșecul notifică: exact o notificare, de tip eroare.
    expect(db.notifications).toHaveLength(1);
    expect((db.notifications[0] as { type: string }).type).toBe("portal_publish_error");
  });

  it("reîncearcă erorile temporare, cu pauză crescătoare, apoi le face finale", async () => {
    const db = fakeDb([{}]);
    await runPortalPublishWorker(db.admin, async (job) => ({
      portalId: job.portal_key,
      ok: false,
      message: "Portal indisponibil",
      httpStatus: 503,
    }));
    expect(db.jobs[0]?.status).toBe("queued");
    expect(Date.parse(db.jobs[0]!.next_attempt_at)).toBeGreaterThan(Date.now());
    expect(decideJobResult({ attempts: 4 }, { portalId: "x", ok: false, message: "x", httpStatus: 503 }, undefined).status).toBe("error");
    expect(decideJobResult({ attempts: 1 }, { portalId: "x", ok: false, message: "Câmp obligatoriu lipsă" }, undefined).status).toBe("error");
  });
});
