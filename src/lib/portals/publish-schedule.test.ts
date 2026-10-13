import { describe, expect, it, vi } from "vitest";
import { bucharestLocalToUtc, formatScheduleLabel, scheduleWindowError } from "./publish-schedule";
import { runDueSchedules } from "./publish-schedule.server";
import { enqueuePublishJobsForOrg } from "./publish-enqueue.server";

vi.mock("./slots.server", () => ({ ensurePortalSlotAvailable: async () => ({ ok: true }) }));

type Row = Record<string, unknown>;
function fakeAdmin(tables: Record<string, Row[]>, claim: Row[] = []) {
  const inserts: { table: string; row: Row }[] = [];
  const updates: { table: string; values: Row; filters: [string, unknown][] }[] = [];
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let update: Row | null = null;
    const match = () =>
      (tables[table] ?? []).filter((r) =>
        filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)),
      );
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      in: (k: string, v: unknown[]) => (filters.push([k, v]), q),
      update: (v: Row) => ((update = v), q),
      insert: async (row: Row) => (inserts.push({ table, row }), { error: null }),
      maybeSingle: async () => ({ data: match()[0] ?? null }),
      then: (resolve: (v: unknown) => void) => {
        if (update) {
          const hit = match();
          updates.push({ table, values: update, filters: [...filters] });
          for (const r of hit) Object.assign(r, update);
          return resolve({ data: hit, error: null });
        }
        return resolve({ data: match(), error: null });
      },
    };
    return q;
  };
  return { from, rpc: async () => ({ data: claim, error: null }), inserts, updates };
}

const schedule = {
  id: "s1",
  organization_id: "org",
  property_id: "p1",
  portal_key: "storia",
  scheduled_at: "2026-10-14T05:00:00.000Z",
  promoted: null,
  requested_by: "agent",
  superadmin: false,
  status: "scheduled",
};
const baseTables = () => ({
  properties: [{ id: "p1", organization_id: "org", status: "active", deleted_at: null, assigned_to: "agent" }],
  profiles: [{ id: "agent", is_active: true, organization_id: "org" }],
  user_roles: [{ user_id: "agent", role: "agent", organization_id: "org" }],
  portal_publish_schedules: [{ ...schedule }],
});

describe("ora României → UTC", () => {
  it("vara (EEST, +3): 14.10.2026 08:00 → 05:00 UTC", () => {
    expect(bucharestLocalToUtc("2026-10-14", "08:00")).toBe("2026-10-14T05:00:00.000Z");
    expect(formatScheduleLabel("2026-10-14T05:00:00.000Z")).toBe("14.10.2026, 08:00");
  });
  it("iarna (EET, +2): după 25.10.2026, 08:00 → 06:00 UTC", () => {
    expect(bucharestLocalToUtc("2026-10-26", "08:00")).toBe("2026-10-26T06:00:00.000Z");
  });
  it("noaptea trecerii la ora de iarnă: 03:30 dublă → prima apariție (ora de vară)", () => {
    expect(bucharestLocalToUtc("2026-10-25", "03:30")).toBe("2026-10-25T00:30:00.000Z");
    expect(bucharestLocalToUtc("2026-10-25", "05:00")).toBe("2026-10-25T03:00:00.000Z");
  });
  it("fereastra: minim +5 min, maxim 90 de zile", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(scheduleWindowError("2026-10-13T12:03:00Z", now)).toMatch(/5 minute/);
    expect(scheduleWindowError("2026-10-13T12:06:00Z", now)).toBeNull();
    expect(scheduleWindowError("2027-01-12T12:01:00Z", now)).toMatch(/90 de zile/);
  });
});

describe("execuția programărilor", () => {
  it("la oră, pune publicarea în coada existentă și marchează executat", async () => {
    const tables = baseTables();
    const admin = fakeAdmin(tables, [schedule]);
    const enqueue = vi.fn(async () => ({ results: [{ portalId: "storia", portalName: "Storia", queued: true, message: null }] }));
    const stats = await runDueSchedules(admin, enqueue);
    expect(stats).toEqual({ claimed: 1, executed: 1, failed: 0 });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ fromSchedule: true, actorId: "agent" }));
    expect(tables.portal_publish_schedules[0]!.status).toBe("executed");
    expect(admin.inserts.some((i) => i.table === "notifications" && i.row.type === "portal_schedule_executed")).toBe(true);
    expect(admin.inserts.some((i) => i.table === "audit_logs" && i.row.action === "portal_schedule.executed")).toBe(true);
  });

  it("fără sloturi: eșuat cu motivul din coadă, fără publicare", async () => {
    const tables = baseTables();
    const admin = fakeAdmin(tables, [schedule]);
    const enqueue = vi.fn(async () => ({
      results: [{ portalId: "storia", portalName: "Storia", queued: false, message: "Nu mai ai locuri libere." }],
    }));
    await runDueSchedules(admin, enqueue);
    expect(tables.portal_publish_schedules[0]!.status).toBe("failed");
    expect(tables.portal_publish_schedules[0]!.reason).toBe("Nu mai ai locuri libere.");
    expect(admin.inserts.some((i) => i.row.type === "portal_schedule_failed")).toBe(true);
  });

  it("proprietate retrasă (vândută): eșuat, coada nu e apelată", async () => {
    const tables = baseTables();
    tables.properties[0]!.status = "sold";
    const admin = fakeAdmin(tables, [schedule]);
    const enqueue = vi.fn();
    await runDueSchedules(admin, enqueue);
    expect(enqueue).not.toHaveBeenCalled();
    expect(tables.portal_publish_schedules[0]!.status).toBe("failed");
    expect(String(tables.portal_publish_schedules[0]!.reason)).toMatch(/nu mai este activă/);
  });

  it("agentul care a programat nu mai e activ: eșuat", async () => {
    const tables = baseTables();
    tables.profiles[0]!.is_active = false;
    const admin = fakeAdmin(tables, [schedule]);
    const enqueue = vi.fn();
    await runDueSchedules(admin, enqueue);
    expect(enqueue).not.toHaveBeenCalled();
    expect(tables.portal_publish_schedules[0]!.status).toBe("failed");
  });
});

describe("anularea la publicare manuală", () => {
  it("publicarea manuală pe portal anulează programarea activă", async () => {
    const tables = { ...baseTables(), portal_publications: [] as Row[], portal_publish_jobs: [] as Row[] };
    const admin = fakeAdmin(tables);
    await enqueuePublishJobsForOrg({
      organizationId: "org",
      superadmin: true,
      actorId: "agent",
      data: { propertyId: "p1", selections: [{ portalId: "storia", enabled: true }], syncExisting: true },
      loadAdmin: async () => admin,
      activatedPortalIds: async () => new Set(["storia"]),
    });
    expect(tables.portal_publish_schedules[0]!.status).toBe("cancelled");
    expect(admin.inserts.some((i) => i.row.action === "portal_schedule.cancelled")).toBe(true);
  });

  it("execuția din programare nu își anulează propria programare", async () => {
    const tables = { ...baseTables(), portal_publications: [] as Row[], portal_publish_jobs: [] as Row[] };
    const admin = fakeAdmin(tables);
    await enqueuePublishJobsForOrg({
      organizationId: "org",
      superadmin: true,
      actorId: "agent",
      data: { propertyId: "p1", selections: [{ portalId: "storia", enabled: true }], syncExisting: true },
      loadAdmin: async () => admin,
      activatedPortalIds: async () => new Set(["storia"]),
      fromSchedule: true,
    });
    expect(tables.portal_publish_schedules[0]!.status).toBe("scheduled");
  });
});
