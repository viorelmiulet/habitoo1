/**
 * Ștergerea „soft” a anunțurilor: drepturi, retrageri, dispariția din feeduri.
 * Fără nicio bază de date reală și fără apeluri către portaluri.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { deletePropertyCore } from "@/lib/property-delete.functions";
import { canDeleteProperty, DELETE_PROPERTY_TEXT } from "@/components/app/DeletePropertyDialog";
import { enqueueStatusWithdrawals, runStatusWithdrawTick } from "@/lib/portals/status-withdraw.server";
import { isPropertyFeedEligible } from "@/lib/site-feed/mapper";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ORG = "org-1";
const ADMIN = "admin-1";
const AGENT = "agent-1";
const OTHER = "agent-2";

/**
 * Simulare fidelă a RPC-urilor și a RLS-ului din migrare
 * (`delete_property`, `restore_property`, gardă, politica DELETE).
 */
function fakeDb() {
  const tables: Record<string, Row[]> = {
    properties: [
      { id: "p-own", organization_id: ORG, assigned_to: AGENT, status: "active", deleted_at: null, publish_status: "published" },
      { id: "p-other", organization_id: ORG, assigned_to: OTHER, status: "active", deleted_at: null, publish_status: "published" },
    ],
    portal_publications: [
      { organization_id: ORG, property_id: "p-own", portal_key: "imobiliare_ro", enabled: true },
      { organization_id: ORG, property_id: "p-own", portal_key: "storia", enabled: true },
      { organization_id: ORG, property_id: "p-own", portal_key: "oferteimobiliare", enabled: true },
    ],
    audit_logs: [],
  };
  const roles: Record<string, string> = { [ADMIN]: "agency_admin", [AGENT]: "agent", [OTHER]: "agent", sa: "superadmin" };
  const deny = (message: string) => ({ data: null, error: { message } });
  const asUser = (uid: string) => ({
    rpc: async (name: string, params?: Row) => {
      const p = params ?? {};
      const row = tables["properties"]!.find((r) => r["id"] === p["_id"]);
      if (name === "delete_property") {
        if (!row || (row["deleted_at"] && roles[uid] !== "superadmin")) return deny("Anunțul nu a fost găsit.");
        const allowed =
          roles[uid] === "superadmin" ||
          (row["organization_id"] === ORG && (roles[uid] === "agency_admin" || row["assigned_to"] === uid));
        if (!allowed) return deny("Nu ai dreptul să ștergi acest anunț.");
        Object.assign(row, { deleted_at: "now", deleted_by: uid, pre_delete_status: row["status"] });
        tables["audit_logs"]!.push({ action: "property.deleted", entity_id: row["id"] });
        return { data: row["organization_id"], error: null };
      }
      if (name === "restore_property") {
        if (roles[uid] !== "superadmin") return deny("Doar administratorul platformei poate restabili anunțuri.");
        Object.assign(row!, { deleted_at: null, status: row!["pre_delete_status"], pre_delete_status: null });
        tables["audit_logs"]!.push({ action: "property.restored", entity_id: row!["id"] });
        return { data: ORG, error: null };
      }
      return deny("necunoscut");
    },
    /** DELETE definitiv: politica permite doar superadminul. */
    hardDelete: (id: string) => {
      if (roles[uid] !== "superadmin") return { count: 0 };
      tables["properties"] = tables["properties"]!.filter((r) => r["id"] !== id);
      return { count: 1 };
    },
    /** Garda: golirea `deleted_at` direct e refuzată. */
    clearDeletedAt: (id: string) => {
      if (roles[uid] !== "superadmin") return deny("Ștergerea și restabilirea anunțurilor se fac doar prin acțiunile dedicate.");
      tables["properties"]!.find((r) => r["id"] === id)!["deleted_at"] = null;
      return { data: null, error: null };
    },
  });
  return { tables, asUser };
}

/** Admin fals pentru coada de retrageri. */
function fakeAdmin(tables: Record<string, Row[]>) {
  let seq = 0;
  const t = (n: string) => (tables[n] ??= []);
  const from = (name: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const q: Row = {};
    const rows = () => t(name).filter((r) => filters.every((f) => f(r)));
    for (const k of ["select", "or", "order", "limit"]) q[k] = () => q;
    q["eq"] = (c: string, v: unknown) => (filters.push((r) => r[c] === v), q);
    q["in"] = (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q);
    q["insert"] = async (row: Row | Row[]) => {
      for (const r of Array.isArray(row) ? row : [row]) t(name).push({ id: `id-${++seq}`, attempts: 0, max_attempts: 5, ...r });
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
      const item = t("portal_status_withdraw_items").find((r) => r["id"] === params["_item_id"] && ["queued", "running"].includes(r["status"]));
      if (!item) return { data: [], error: null };
      item["status"] = "running";
      return { data: [{ ...item }], error: null };
    }
    return { data: null, error: null };
  };
  return { from, rpc };
}

const deps = { enqueue: enqueueStatusWithdrawals, logOperation: vi.fn(async () => {}) };

describe("ștergerea soft a anunțurilor", () => {
  it("agentul își șterge anunțul propriu, dar nu pe al altuia", async () => {
    const { tables, asUser } = fakeDb();
    const admin = fakeAdmin(tables);
    await deletePropertyCore(asUser(AGENT), admin, { propertyId: "p-own", actorId: AGENT }, deps);
    expect(tables["properties"]!.find((r) => r["id"] === "p-own")!["deleted_at"]).toBeTruthy();
    await expect(
      deletePropertyCore(asUser(AGENT), admin, { propertyId: "p-other", actorId: AGENT }, deps),
    ).rejects.toThrow(/dreptul/);
    expect(tables["properties"]!.find((r) => r["id"] === "p-other")!["deleted_at"]).toBeNull();
  });

  it("adminul agenției șterge orice anunț din agenție", async () => {
    const { tables, asUser } = fakeDb();
    const admin = fakeAdmin(tables);
    await deletePropertyCore(asUser(ADMIN), admin, { propertyId: "p-other", actorId: ADMIN }, deps);
    const row = tables["properties"]!.find((r) => r["id"] === "p-other")!;
    expect(row["deleted_by"]).toBe(ADMIN);
    expect(row["pre_delete_status"]).toBe("active");
    expect(tables["audit_logs"]!.some((a) => a["action"] === "property.deleted")).toBe(true);
  });

  it("nimeni în afară de superadmin nu restabilește și nu șterge definitiv", async () => {
    const { tables, asUser } = fakeDb();
    await deletePropertyCore(asUser(ADMIN), fakeAdmin(tables), { propertyId: "p-own", actorId: ADMIN }, deps);
    for (const uid of [ADMIN, AGENT]) {
      expect((await asUser(uid).rpc("restore_property", { _id: "p-own" })).error).not.toBeNull();
      expect(asUser(uid).clearDeletedAt("p-own").error).not.toBeNull();
      expect(asUser(uid).hardDelete("p-own").count).toBe(0);
    }
    const res = await asUser("sa").rpc("restore_property", { _id: "p-own" });
    expect(res.error).toBeNull();
    const row = tables["properties"]!.find((r) => r["id"] === "p-own")!;
    expect(row["deleted_at"]).toBeNull();
    expect(row["status"]).toBe("active");
    expect(tables["audit_logs"]!.some((a) => a["action"] === "property.restored")).toBe(true);
  });

  it("la ștergere se creează retragerile de pe portaluri (motiv „deleted”)", async () => {
    const { tables, asUser } = fakeDb();
    const admin = fakeAdmin(tables);
    const out = await deletePropertyCore(asUser(AGENT), admin, { propertyId: "p-own", actorId: AGENT }, deps);
    expect(out.queued).toBe(2);
    expect(out.manual).toBe(1);
    const items = tables["portal_status_withdraw_items"]!;
    expect(items.every((i) => i["reason"] === "deleted")).toBe(true);
    expect(tables["portal_publications"]!.find((p) => p["portal_key"] === "oferteimobiliare")!["enabled"]).toBe(false);

    const calls: string[] = [];
    await runStatusWithdrawTick(
      admin,
      {
        withdraw: async (i) => (calls.push(i.portalId), { ok: true, message: "retrasă" }),
        notify: async () => {},
      },
      { maxItems: 50, budgetMs: 10_000 },
    );
    expect(calls.sort()).toEqual(["imobiliare_ro", "storia"]);
  });

  it("restabilirea înainte de retragere anulează retragerea și nu republică", async () => {
    const { tables, asUser } = fakeDb();
    const admin = fakeAdmin(tables);
    await deletePropertyCore(asUser(AGENT), admin, { propertyId: "p-own", actorId: AGENT }, deps);
    await asUser("sa").rpc("restore_property", { _id: "p-own" });
    const withdraw = vi.fn();
    await runStatusWithdrawTick(admin, { withdraw, notify: async () => {} }, { maxItems: 50, budgetMs: 10_000 });
    expect(withdraw).not.toHaveBeenCalled();
    expect(tables["portal_status_withdraw_items"]!.filter((i) => i["status"] === "cancelled")).toHaveLength(2);
  });

  it("anunțul șters dispare din feeduri", () => {
    expect(isPropertyFeedEligible({ publish_status: "published", deleted_at: "2026-01-01", status: "active" } as never)).toBe(false);
    expect(isPropertyFeedEligible({ publish_status: "published", deleted_at: null, status: "active" } as never)).toBe(true);
  });

  it("butonul apare doar pentru cine are drept; textul confirmării", () => {
    expect(canDeleteProperty({ userId: AGENT }, { assigned_to: AGENT })).toBe(true);
    expect(canDeleteProperty({ userId: AGENT }, { assigned_to: OTHER })).toBe(false);
    expect(canDeleteProperty({ userId: ADMIN, isAdmin: true }, { assigned_to: OTHER })).toBe(true);
    expect(canDeleteProperty({ userId: "sa", isSuperadmin: true }, { assigned_to: null })).toBe(true);
    expect(DELETE_PROPERTY_TEXT).toBe(
      "Anunțul va fi retras de pe toate portalurile și nu va mai fi vizibil în agenție. Doar administratorul platformei îl poate restabili.",
    );
  });

  it("migrarea: RLS ascunde șterse, DELETE doar superadmin, gardă și RPC-uri", () => {
    const dir = "drizzle/migrations";
    const file = readdirSync(dir).find((f) => f.includes("property_soft_delete"))!;
    const sql = readFileSync(`${dir}/${file}`, "utf8");
    expect(sql).toMatch(/CREATE POLICY properties_sel[\s\S]*deleted_at IS NULL/);
    expect(sql).toMatch(/CREATE POLICY properties_del[^;]*USING \(public\.is_superadmin\(\)\)/);
    expect(sql).toMatch(/CREATE TRIGGER properties_guard_soft_delete BEFORE UPDATE/);
    expect(sql).toMatch(/FUNCTION public\.restore_property[\s\S]*NOT public\.is_superadmin\(\)/);
    expect(sql).toMatch(/FUNCTION public\.delete_property[\s\S]*agency_admin[\s\S]*assigned_to = uid/);
  });
});
