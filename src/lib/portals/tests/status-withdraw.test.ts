/**
 * Retragerea automată la Vândut / Închiriat / Arhivat — fără niciun apel real
 * către portaluri: retragerea este o funcție simulată.
 */
import { describe, expect, it, vi } from "vitest";
import {
  enqueueStatusWithdrawals,
  runStatusWithdrawTick,
  withdrawReasonForStatus,
  isManualWithdrawPortal,
  type ProcessDeps,
} from "@/lib/portals/status-withdraw.server";
import { FEED_PUBLIC_STATUSES, isPropertyFeedEligible } from "@/lib/site-feed/mapper";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = { ...seed };
  let seq = 0;
  const t = (name: string) => (tables[name] ??= []);
  const from = (name: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const q: Row = {};
    const rows = () => t(name).filter((r) => filters.every((f) => f(r)));
    q["select"] = () => q;
    q["eq"] = (c: string, v: unknown) => (filters.push((r) => r[c] === v), q);
    q["in"] = (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q);
    q["or"] = () => q;
    q["order"] = () => q;
    q["limit"] = () => q;
    q["insert"] = async (row: Row | Row[]) => {
      for (const r of Array.isArray(row) ? row : [row])
        t(name).push({ id: `id-${++seq}`, attempts: 0, max_attempts: 5, created_at: new Date().toISOString(), ...r });
      return { data: null, error: null };
    };
    q["update"] = (p: Row) => ((patch = p), q);
    q["maybeSingle"] = async () => ({ data: rows()[0] ?? null, error: null });
    q["then"] = (resolve: (v: unknown) => unknown) => {
      if (patch) for (const r of rows()) Object.assign(r, patch);
      return resolve({ data: rows(), error: null });
    };
    return q;
  };
  const rpc = async (name: string, params: Row) => {
    if (name === "claim_portal_status_withdraw_item") {
      const item = t("portal_status_withdraw_items").find(
        (r) => r["id"] === params["_item_id"] && ["queued", "running"].includes(r["status"]),
      );
      if (!item) return { data: [], error: null };
      item["status"] = "running";
      return { data: [{ ...item }], error: null };
    }
    return { data: null, error: null };
  };
  return { admin: { from, rpc }, tables };
}

const ORG = "org-1";
const prop = (id: string, status = "sold") => ({ id, organization_id: ORG, status, assigned_to: "agent-1", reference: id.toUpperCase(), title: id });
const pub = (property_id: string, portal_key: string) => ({ organization_id: ORG, property_id, portal_key, enabled: true });

const enqueueDeps = { logOperation: vi.fn(async () => {}) };

function processDeps(fail: Set<string> = new Set()) {
  const calls: { propertyId: string; portalId: string; reason: string }[] = [];
  const notify = vi.fn(async () => {});
  let clock = Date.now();
  const deps: ProcessDeps = {
    withdraw: async (i) => {
      calls.push({ propertyId: i.propertyId, portalId: i.portalId, reason: i.reason });
      return fail.has(i.portalId) ? { ok: false, message: "eroare portal" } : { ok: true, message: "retrasă" };
    },
    notify,
    now: () => clock,
  };
  return { deps, calls, notify, advance: (ms: number) => (clock += ms) };
}

/** Rulează workerul până se golește coada (sărind peste pauzele dintre încercări). */
async function drain(admin: never, p: ReturnType<typeof processDeps>, tables: Record<string, Row[]>) {
  for (let i = 0; i < 10; i++) {
    for (const r of tables["portal_status_withdraw_items"] ?? []) r["next_attempt_at"] = null;
    await runStatusWithdrawTick(admin, p.deps, { maxItems: 50, budgetMs: 10_000 });
    p.advance(2 * 60 * 60_000);
  }
}

describe("retragerea automată la schimbarea statusului", () => {
  it("motivele corespund statusurilor", () => {
    expect(withdrawReasonForStatus("sold")).toBe("status_sold");
    expect(withdrawReasonForStatus("rented")).toBe("status_rented");
    expect(withdrawReasonForStatus("archived")).toBe("archived");
    expect(withdrawReasonForStatus("active")).toBeNull();
    expect(isManualWithdrawPortal("oferteimobiliare")).toBe(true);
    expect(isManualWithdrawPortal("imobiliare_ro")).toBe(false);
    for (const feed of ["homepitch", "imove", "clickimob", "properstar"])
      expect(isManualWithdrawPortal(feed)).toBe(false);
  });

  it("Vândut → câte o retragere pentru fiecare portal publicat; OferteImobiliare manual, fără apel", async () => {
    const { admin, tables } = fakeDb({
      properties: [prop("p1")],
      portal_publications: [pub("p1", "imobiliare_ro"), pub("p1", "lacheie"), pub("p1", "oferteimobiliare")],
    });
    const out = await enqueueStatusWithdrawals(admin as never, { organizationId: ORG, propertyIds: ["p1"], reason: "status_sold", actorId: "u1" }, enqueueDeps);
    expect(out.queued.map((q) => q.portalId).sort()).toEqual(["imobiliare_ro", "lacheie"]);
    expect(out.manual.map((q) => q.portalId)).toEqual(["oferteimobiliare"]);
    const oi = tables["portal_publications"]!.find((r) => r["portal_key"] === "oferteimobiliare")!;
    expect(oi["enabled"]).toBe(false);
    expect(oi["withdraw_reason"]).toBe("status_sold");

    const p = processDeps();
    await drain(admin as never, p, tables);
    expect(p.calls.map((c) => c.portalId).sort()).toEqual(["imobiliare_ro", "lacheie"]);
    expect(p.calls.every((c) => c.reason === "status_sold")).toBe(true);
    const items = tables["portal_status_withdraw_items"]!;
    expect(items.filter((i) => i["status"] === "done")).toHaveLength(2);
    expect(items.find((i) => i["portal_key"] === "oferteimobiliare")!["status"]).toBe("manual_required");
    expect(tables["audit_logs"]!.some((a) => a["action"] === "portal_auto_withdraw_succeeded")).toBe(true);
    expect(enqueueDeps.logOperation).toHaveBeenCalledWith(expect.objectContaining({ portal: "oferteimobiliare", operation: "auto_withdraw_manual_required" }));
  });

  it("eroare la un portal → reîncercări fără notificare duplicată la epuizare", async () => {
    const { admin, tables } = fakeDb({
      properties: [prop("p1", "rented")],
      portal_publications: [pub("p1", "imobiliare_ro"), pub("p1", "storia")],
    });
    await enqueueStatusWithdrawals(admin as never, { organizationId: ORG, propertyIds: ["p1"], reason: "status_rented", actorId: "u1" }, enqueueDeps);
    const p = processDeps(new Set(["storia"]));
    await drain(admin as never, p, tables);
    expect(p.calls.filter((c) => c.portalId === "storia")).toHaveLength(5);
    expect(p.calls.filter((c) => c.portalId === "imobiliare_ro")).toHaveLength(1);
    const items = tables["portal_status_withdraw_items"]!;
    expect(items.find((i) => i["portal_key"] === "storia")!["status"]).toBe("failed");
    expect(items.find((i) => i["portal_key"] === "imobiliare_ro")!["status"]).toBe("done");
    expect(p.notify).not.toHaveBeenCalled();
    expect(tables["audit_logs"]!.some((a) => a["action"] === "portal_auto_withdraw_failed")).toBe(true);
  });

  it("revenire la Activ → nicio retragere rămasă și nicio republicare automată", async () => {
    const { admin, tables } = fakeDb({
      properties: [prop("p1", "sold")],
      portal_publications: [pub("p1", "imobiliare_ro")],
    });
    await enqueueStatusWithdrawals(admin as never, { organizationId: ORG, propertyIds: ["p1"], reason: "status_sold", actorId: "u1" }, enqueueDeps);
    tables["properties"]![0]!["status"] = "active";
    const p = processDeps();
    await drain(admin as never, p, tables);
    expect(p.calls).toHaveLength(0);
    expect(tables["portal_status_withdraw_items"]![0]!["status"]).toBe("cancelled");
    // Modulul nu are nicio cale de publicare: la revenire nu se trimite nimic.
    const src = await import("node:fs").then((fs) => fs.readFileSync("src/lib/portals/status-withdraw.server.ts", "utf8"));
    expect(src).not.toMatch(/action:\s*"publish"|publishListing/);
  });

  it("acțiune în masă pe 3 proprietăți → 3 seturi de retrageri", async () => {
    const ids = ["p1", "p2", "p3"];
    const { admin, tables } = fakeDb({
      properties: ids.map((id) => prop(id)),
      portal_publications: ids.flatMap((id) => [pub(id, "imobiliare_ro"), pub(id, "storia")]),
    });
    const out = await enqueueStatusWithdrawals(admin as never, { organizationId: ORG, propertyIds: ids, reason: "status_sold", actorId: "u1" }, enqueueDeps);
    expect(out.queued).toHaveLength(6);
    const p = processDeps();
    await drain(admin as never, p, tables);
    for (const id of ids)
      expect(p.calls.filter((c) => c.propertyId === id).map((c) => c.portalId).sort()).toEqual(["imobiliare_ro", "storia"]);
  });

  it("feedurile nu conțin proprietăți vândute sau închiriate", () => {
    expect(FEED_PUBLIC_STATUSES).not.toContain("sold");
    expect(FEED_PUBLIC_STATUSES).not.toContain("rented");
    expect(FEED_PUBLIC_STATUSES).not.toContain("archived");
    for (const status of ["sold", "rented", "archived"])
      expect(isPropertyFeedEligible({ publish_status: "published", deleted_at: null, status } as never)).toBe(false);
    expect(isPropertyFeedEligible({ publish_status: "published", deleted_at: null, status: "active" } as never)).toBe(true);
  });
});

describe("aceeași cale ca debifarea", () => {
  it("workerul apelează applyPortalSelectionForOrg cu enabled:false și motivul", async () => {
    vi.resetModules();
    const apply = vi.fn(async () => ({ ok: true, results: [{ portalId: "storia", portalName: "Storia", action: "withdrawn", ok: true, message: "retrasă" }] }));
    vi.doMock("@/lib/portals.functions", () => ({ applyPortalSelectionForOrg: apply, performPortalWithdraw: vi.fn() }));
    const mod = await import("@/lib/portals/status-withdraw.server");
    const deps = await mod.realProcessDeps({ from: () => ({}), rpc: async () => ({}) } as never);
    const out = await deps.withdraw({ organizationId: ORG, propertyId: "p1", portalId: "storia", actorId: "u1", reason: "status_sold" });
    expect(out.ok).toBe(true);
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      withdrawReason: "status_sold",
      data: { propertyId: "p1", selections: [{ portalId: "storia", enabled: false }], syncExisting: false },
    }));
    vi.doUnmock("@/lib/portals.functions");
  });
});
