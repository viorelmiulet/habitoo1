import { describe, expect, it, vi } from "vitest";
import {
  processDeletionJob, startAccountDeletion,
  type DeletionDeps, type DeletionJob, type DeletionStore, type DeletionStorage, type ProfileRow, type WithdrawResult,
} from "@/lib/account-deletion.server";

type Prop = { id: string; organization_id: string; reference: string | null; assigned_to: string | null };

function world() {
  const profiles: Record<string, ProfileRow> = {
    admin: { id: "admin", organization_id: "orgS", is_active: true, full_name: "Super Admin", avatar_url: null },
    u1: { id: "u1", organization_id: "orgA", is_active: true, full_name: "Ana Pop", avatar_url: "orgA/u1/avatar.jpg" },
    u2: { id: "u2", organization_id: "orgA", is_active: true, full_name: "Ion Pop", avatar_url: null },
    x: { id: "x", organization_id: "orgB", is_active: true, full_name: "Xenia B", avatar_url: null },
    off: { id: "off", organization_id: "orgB", is_active: false, full_name: "Inactiv", avatar_url: null },
  };
  const superadmins = new Set(["admin"]);
  const orgs = new Set(["orgA", "orgB", "orgS"]);
  const properties: Prop[] = [
    { id: "p1", organization_id: "orgA", reference: "HB-1", assigned_to: "u1" },
    { id: "p2", organization_id: "orgA", reference: "R-7", assigned_to: "u1" },
    { id: "pB", organization_id: "orgB", reference: "R-7", assigned_to: "x" },
  ];
  const tables: Record<string, { id: string; organization_id: string; assigned_to?: string; user_id?: string }[]> = {
    leads: [{ id: "l1", organization_id: "orgA", assigned_to: "u1" }],
    contacts: [{ id: "c1", organization_id: "orgA", assigned_to: "u1" }],
    requests: [{ id: "r1", organization_id: "orgA", assigned_to: "u1" }],
    activities: [{ id: "a1", organization_id: "orgA", assigned_to: "u1" }],
    goals: [{ id: "g1", organization_id: "orgA", user_id: "u1" }],
  };
  const portals: Record<string, { portal: string; external_id: string | null; public_url: string | null }[]> = {
    p1: [
      { portal: "storia", external_id: "S1", public_url: "https://storia.ro/1" },
      { portal: "oferteimobiliare", external_id: "O1", public_url: "https://oferteimobiliare.ro/1" },
    ],
    p2: [{ portal: "romimo", external_id: "R2", public_url: null }],
  };
  const portalRowsDeleted: string[] = [];
  const images: Record<string, { id: string; storage_path: string }[]> = {
    p1: [{ id: "i1", storage_path: "orgA/p1/a.jpg" }],
    p2: [{ id: "i2", storage_path: "orgA/p2/b.jpg" }],
  };
  const files = new Set([
    "orgA/p1/a.jpg", "orgA/p2/b.jpg", "watermarked/h1/orgA/p1/a.jpg", "watermarked/h1/orgA/p2/b.jpg", "orgB/pB/z.jpg",
  ]);
  const buckets: Record<string, Set<string>> = { "property-media": files, avatars: new Set(["orgA/u1/avatar.jpg"]) };
  const jobs: Record<string, DeletionJob> = {};
  const audits: { action: string; new_values?: unknown }[] = [];
  const authDeleted: string[] = [];

  const col = (kind: string) => (kind === "user" ? "assigned_to" : "organization_id");
  const store: DeletionStore = {
    getProfile: async (id) => profiles[id] ?? null,
    isSuperadmin: async (id) => superadmins.has(id),
    organizationExists: async (id) => orgs.has(id),
    hasActiveJob: async (kind, t) => Object.values(jobs).some((j) => j.kind === kind && j.target_id === t && ["queued", "running"].includes(j.status)),
    insertJob: async (row) => {
      const id = `job${Object.keys(jobs).length + 1}`;
      jobs[id] = { ...row, id, status: "queued", phase: "properties", done: 0, failed: 0, report: {}, errors: [] } as DeletionJob;
      return id;
    },
    countTargetProperties: async (kind, t) => properties.filter((p) => (p as never)[col(kind)] === t).length,
    listTargetProperties: async (kind, t, ex, limit) => properties.filter((p) => (p as never)[col(kind)] === t && !ex.includes(p.id)).slice(0, limit),
    listPortalTargets: async (id) => portals[id] ?? [],
    listImages: async (id) => images[id] ?? [],
    updateImagePath: async (id, path) => {
      for (const list of Object.values(images)) for (const i of list) if (i.id === id) i.storage_path = path;
    },
    hardDeleteProperty: async (id) => {
      properties.splice(properties.findIndex((p) => p.id === id), 1);
      delete portals[id];
    },
    moveProperty: async (id, to) => {
      const p = properties.find((x) => x.id === id)!;
      const orgTo = profiles[to]!.organization_id!;
      let newRef: string | null = null;
      if (orgTo !== p.organization_id && properties.some((o) => o.id !== id && o.organization_id === orgTo && o.reference === p.reference)) newRef = "HB-900";
      delete portals[id];
      portalRowsDeleted.push(id);
      Object.assign(p, { organization_id: orgTo, assigned_to: to, reference: newRef ?? p.reference });
      return { new_reference: newRef };
    },
    reassignSameOrg: async (from, to) => {
      let n = 0;
      for (const p of properties) if (p.assigned_to === from) { p.assigned_to = to; n += 1; }
      for (const [name, rows] of Object.entries(tables)) for (const r of rows) {
        if (name === "goals" ? r.user_id === from : r.assigned_to === from) { if (name === "goals") r.user_id = to; else r.assigned_to = to; }
      }
      return { properties: n };
    },
    applyRest: async (kind, target, mode, to) => {
      const out: Record<string, number> = {};
      const orgTo = to ? profiles[to]!.organization_id! : null;
      for (const [name, rows] of Object.entries(tables)) {
        const owner = (r: (typeof rows)[number]) => kind === "organization" ? r.organization_id === target : (name === "goals" ? r.user_id : r.assigned_to) === target;
        const hit = rows.filter(owner);
        out[name] = hit.length;
        if (mode === "delete") tables[name] = rows.filter((r) => !owner(r));
        else for (const r of hit) { r.organization_id = orgTo!; if (name === "goals") r.user_id = to!; else r.assigned_to = to!; }
      }
      return out;
    },
    deleteUserRows: async (id) => { delete profiles[id]; },
    deleteOrganizationRows: async (org) => {
      orgs.delete(org);
      const ids = Object.values(profiles).filter((p) => p.organization_id === org).map((p) => p.id);
      return { auth_user_ids: ids, member_ids: ids };
    },
    listOrgMemberIds: async (org) => Object.values(profiles).filter((p) => p.organization_id === org).map((p) => p.id),
    updateJob: async (id, patch) => { Object.assign(jobs[id]!, patch); },
    audit: async (row) => { audits.push(row); },
    arm: async () => {},
  };
  const storage: DeletionStorage = {
    list: async (bucket, prefix) => {
      const set = buckets[bucket] ?? new Set<string>();
      const names = new Map<string, boolean>();
      for (const f of set) if (f.startsWith(`${prefix}/`)) {
        const rest = f.slice(prefix.length + 1).split("/");
        names.set(rest[0]!, rest.length > 1 || names.get(rest[0]!) === true);
      }
      return [...names].map(([name, folder]) => ({ name, folder }));
    },
    remove: async (bucket, paths) => paths.filter((p) => buckets[bucket]?.delete(p)).length,
    move: async (bucket, from, to) => { buckets[bucket]!.delete(from); buckets[bucket]!.add(to); },
  };
  const withdraw = vi.fn(async (i: { portalId: string }): Promise<WithdrawResult> =>
    i.portalId === "oferteimobiliare" ? { ok: false, manual: true, message: "manual" } : { ok: true, attempted: true, message: "ok" });
  const deps: DeletionDeps = { store, storage, withdraw, deleteAuthUser: async (id) => { authDeleted.push(id); return { error: null }; } };
  const run = async (jobId: string) => {
    for (let i = 0; i < 10; i += 1) {
      const out = await processDeletionJob(jobs[jobId]!, deps);
      if (out.status !== "running") return out;
    }
    throw new Error("job did not finish");
  };
  return { profiles, properties, tables, portals, images, files, buckets, jobs, audits, authDeleted, withdraw, deps, store, run, portalRowsDeleted };
}

describe("account deletion engine", () => {
  it("delete mode withdraws every external listing, reports manual ones, removes files and rows", async () => {
    const w = world();
    const { jobId } = await startAccountDeletion(w.store, { actorId: "admin", kind: "user", targetId: "u1", mode: "delete", reassignToUserId: null });
    const out = await w.run(jobId);
    expect(out.status).toBe("done");
    expect(w.withdraw.mock.calls.map((c) => [c[0].propertyId, c[0].portalId, c[0].externalId])).toEqual([
      ["p1", "storia", "S1"], ["p1", "oferteimobiliare", "O1"], ["p2", "romimo", "R2"],
    ]);
    const report = w.jobs[jobId]!.report!;
    expect(report.manual).toEqual([{ propertyId: "p1", reference: "HB-1", portal: "oferteimobiliare", url: "https://oferteimobiliare.ro/1" }]);
    expect(report.withdrawn).toBe(2);
    expect([...w.files].sort()).toEqual(["orgB/pB/z.jpg"]);
    expect(w.properties.map((p) => p.id)).toEqual(["pB"]);
    expect(w.tables.leads).toEqual([]);
    expect(w.tables.goals).toEqual([]);
    expect(w.profiles.u1).toBeUndefined();
    expect(w.authDeleted).toEqual(["u1"]);
    expect(w.buckets.avatars!.size).toBe(0);
    expect(w.audits.map((a) => a.action)).toEqual(["account.deletion_started", "account.deleted"]);
  });

  it("retries temporary portal errors and never deletes after a permanent one", async () => {
    const w = world();
    let calls = 0;
    w.withdraw.mockImplementation(async () => (calls += 1) === 1 ? { ok: false, message: "timeout", httpStatus: 503 } : { ok: true, message: "ok" });
    const { jobId } = await startAccountDeletion(w.store, { actorId: "admin", kind: "user", targetId: "u1", mode: "delete", reassignToUserId: null });
    expect((await processDeletionJob(w.jobs[jobId]!, w.deps)).status).toBe("running");
    expect(w.jobs[jobId]!.next_attempt_at).toBeTruthy();
    expect(w.properties).toHaveLength(3);
    expect((await w.run(jobId)).status).toBe("done");

    const v = world();
    v.withdraw.mockImplementation(async () => ({ ok: false, message: "Validare", code: "VALIDATION_ERROR" }));
    const j2 = (await startAccountDeletion(v.store, { actorId: "admin", kind: "user", targetId: "u1", mode: "delete", reassignToUserId: null })).jobId;
    expect((await v.run(j2)).status).toBe("failed");
    expect(v.properties).toHaveLength(3);
    expect(v.profiles.u1).toBeDefined();
  });

  it("reassigns inside the same agency by changing only the agent", async () => {
    const w = world();
    const { jobId } = await startAccountDeletion(w.store, { actorId: "admin", kind: "user", targetId: "u1", mode: "reassign", reassignToUserId: "u2" });
    expect((await w.run(jobId)).status).toBe("done");
    expect(w.withdraw).not.toHaveBeenCalled();
    expect(w.properties.filter((p) => p.assigned_to === "u2").map((p) => p.organization_id)).toEqual(["orgA", "orgA"]);
    expect(w.tables.leads![0]).toMatchObject({ organization_id: "orgA", assigned_to: "u2" });
    expect(w.tables.goals![0]).toMatchObject({ user_id: "u2" });
    expect(w.files.has("orgA/p1/a.jpg")).toBe(true);
  });

  it("reassigns to another agency: moves rows, withdraws and drops old publications, moves photos, renumbers duplicate references", async () => {
    const w = world();
    const { jobId } = await startAccountDeletion(w.store, { actorId: "admin", kind: "user", targetId: "u1", mode: "reassign", reassignToUserId: "x" });
    expect((await w.run(jobId)).status).toBe("done");
    expect(w.withdraw).toHaveBeenCalledTimes(3);
    expect(w.withdraw.mock.calls.every((c) => (c[0] as { organizationId: string }).organizationId === "orgA")).toBe(true);
    expect(w.portalRowsDeleted).toEqual(["p1", "p2"]);
    for (const id of ["p1", "p2"]) expect(w.properties.find((p) => p.id === id)).toMatchObject({ organization_id: "orgB", assigned_to: "x" });
    for (const name of ["leads", "contacts", "requests", "activities", "goals"]) expect(w.tables[name]![0]!.organization_id).toBe("orgB");
    expect(w.images.p1![0]!.storage_path).toBe("orgB/p1/a.jpg");
    expect(w.files.has("orgB/p1/a.jpg")).toBe(true);
    expect(w.files.has("watermarked/h1/orgA/p1/a.jpg")).toBe(false);
    expect(w.properties.find((p) => p.id === "p2")!.reference).toBe("HB-900");
    expect(w.jobs[jobId]!.report!.newReferences).toEqual([{ propertyId: "p2", from: "R-7", to: "HB-900" }]);
  });

  it("organization delete removes agency storage and member accounts", async () => {
    const w = world();
    w.buckets["agency-logos"] = new Set(["orgA/logo.png"]);
    const { jobId } = await startAccountDeletion(w.store, { actorId: "admin", kind: "organization", targetId: "orgA", mode: "delete", reassignToUserId: null });
    expect((await w.run(jobId)).status).toBe("done");
    expect(w.buckets["agency-logos"]!.size).toBe(0);
    expect(w.authDeleted.sort()).toEqual(["u1", "u2"]);
  });

  it("enforces the protections", async () => {
    const w = world();
    const start = (input: Partial<Parameters<typeof startAccountDeletion>[1]>) =>
      startAccountDeletion(w.store, { actorId: "admin", kind: "user", targetId: "u1", mode: "delete", reassignToUserId: null, ...input });
    await expect(start({ targetId: "admin" })).rejects.toThrow(/propriul cont/);
    w.profiles.sa2 = { id: "sa2", organization_id: "orgB", is_active: true, full_name: "S A", avatar_url: null };
    (await w.store.isSuperadmin("sa2")) || (w.store.isSuperadmin = async (id) => id === "admin" || id === "sa2");
    await expect(start({ targetId: "sa2" })).rejects.toThrow(/superadmin/);
    await expect(start({ kind: "organization", targetId: "orgS" })).rejects.toThrow(/faci parte/);
    await expect(start({ mode: "reassign", reassignToUserId: "off" })).rejects.toThrow(/activ/);
    await expect(start({ mode: "reassign", reassignToUserId: "u1" })).rejects.toThrow(/cel șters/);
    await expect(start({ kind: "organization", targetId: "orgA", mode: "reassign", reassignToUserId: "u2" })).rejects.toThrow(/agenția ștearsă/);
    await start({});
    await expect(start({})).rejects.toThrow(/în curs/);
  });
});
