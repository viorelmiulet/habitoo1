import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOMEZZ_NO_ALLOCATION, activateHomezzAgent, buildHomezzAgentRoster, clearHomezzTokenCache, getHomezzAgentToken,
  isValidHomezzPassword, loadHomezzContractPromotions, withHomezzAgentToken, type HomezzAgentDeps,
} from "./agents.server";
import { parseHomezzContractPromotions } from "./promotions";
import type { HomezzResult } from "./client";

const ok = (data: unknown): HomezzResult => ({ ok: true, status: 200, message: "OK", data, raw: "" });
const bad = (message: string): HomezzResult => ({ ok: false, kind: "action_error", status: 400, message, adError: null, retryable: false, raw: "" });

function deps(over: Partial<HomezzAgentDeps> = {}, agents: unknown[] = []) {
  const calls: { action: string; params: Record<string, unknown> }[] = [];
  const d: HomezzAgentDeps = {
    post: vi.fn(async (action, params) => {
      calls.push({ action, params });
      if (action === "agents") return ok(agents);
      if (action === "generate-token") return ok({ token: `tok-${calls.length}` });
      return ok({});
    }),
    agencyKey: async () => "SECRET-KEY",
    member: async () => ({ email: "Ana@x.ro", name: "Ana Pop", phone: "0722 111 222" }),
    allocation: async () => 5,
    link: vi.fn(async () => {}),
    audit: vi.fn(async () => {}),
    ...over,
  };
  return { d, calls };
}

beforeEach(() => clearHomezzTokenCache());

describe("activateHomezzAgent", () => {
  it("agent existent cu aceleași date → niciun edit", async () => {
    const { d, calls } = deps({}, [{ email: "ana@x.ro", name: "Ana Pop", phone: "0722111222", assigned_slots: 5 }]);
    const r = await activateHomezzAgent("o", "a", "u", { confirmed: true }, d);
    expect(r.action).toBe("unchanged");
    expect(calls.map((c) => c.action)).toEqual(["agents"]);
  });
  it("agent existent cu ads diferit → doar edit-agent", async () => {
    const { d, calls } = deps({}, [{ email: "ana@x.ro", name: "Ana Pop", phone: "0722111222", assigned_slots: 2 }]);
    await activateHomezzAgent("o", "a", "u", { confirmed: true }, d);
    expect(calls.map((c) => c.action)).toEqual(["agents", "edit-agent"]);
    expect(calls[1]!.params).toEqual({ key: "SECRET-KEY", email: "ana@x.ro", ads: 5 });
  });
  it("agent nou → add-agent cu parolă validă și acorduri", async () => {
    const { d, calls } = deps();
    const r = await activateHomezzAgent("o", "a", "u", { confirmed: true }, d);
    const add = calls.find((c) => c.action === "add-agent")!;
    expect(isValidHomezzPassword(String(add.params["password"]))).toBe(true);
    expect(String(add.params["password"])).toHaveLength(24);
    expect(add.params).toMatchObject({ ads: 5, terms_and_conditions: 1, privacy_policy: 1, hide_phone: 0, email: "ana@x.ro" });
    expect(JSON.stringify(r)).not.toContain(String(add.params["password"]));
    const auditArg = JSON.stringify((d.audit as ReturnType<typeof vi.fn>).mock.calls);
    expect(auditArg).not.toContain(String(add.params["password"]));
    expect(auditArg).not.toContain("SECRET-KEY");
    expect(d.link).toHaveBeenCalledWith("o", "u", "ana@x.ro");
  });
  it("fără alocare → refuz fără apeluri", async () => {
    const { d, calls } = deps({ allocation: async () => null });
    await expect(activateHomezzAgent("o", "a", "u", { confirmed: true }, d)).rejects.toThrow(HOMEZZ_NO_ALLOCATION);
    expect(calls).toHaveLength(0);
  });
  it("fără confirmare → niciun apel", async () => {
    const { d, calls } = deps();
    await expect(activateHomezzAgent("o", "a", "u", { confirmed: false }, d)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("token agent", () => {
  it("memorat și reînnoit o singură dată la eroare de token", async () => {
    const log = vi.spyOn(console, "log"); const err = vi.spyOn(console, "error");
    const { d, calls } = deps();
    const t1 = await getHomezzAgentToken("o", "u", d);
    expect(await getHomezzAgentToken("o", "u", d)).toBe(t1);
    expect(calls.filter((c) => c.action === "generate-token")).toHaveLength(1);
    const run = vi.fn(async (t: string) => (t === t1 ? bad("Token expirat") : bad("Token expirat")));
    const r = await withHomezzAgentToken("o", "u", d, run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(false);
    expect(calls.filter((c) => c.action === "generate-token")).toHaveLength(2);
    const logged = JSON.stringify([...log.mock.calls, ...err.mock.calls]);
    expect(logged).not.toContain("tok-");
  });
});

describe("roster și contract HomeZZ", () => {
  const members = [
    { id: "active", full_name: "Agent activ", email: "activ@example.ro" },
    { id: "inactive", full_name: "Agent neactivat", email: "neactivat@example.ro" },
  ];
  const agent = (promotions: unknown) => ({
    email: "activ@example.ro", name: "Agent activ", phone: null, assignedSlots: 10, remainingSlots: 10, promotions,
  });

  it("agent activ fără promovări HomeZZ → patru tipuri cu zero; neactivat → fără promovări", () => {
    const roster = buildHomezzAgentRoster(members, [], { agents: [agent(null)], error: null }, null);
    expect(roster.members[0]!.promotions.map((p) => ({ id: p.id, total: p.total, remaining: p.remaining }))).toEqual([
      { id: 3, total: 0, remaining: 0 }, { id: 6, total: 0, remaining: 0 },
      { id: 9, total: 0, remaining: 0 }, { id: 7, total: 0, remaining: 0 },
    ]);
    expect(roster.members[1]!.active).toBe(false);
    expect(roster.members[1]!.promotions).toEqual([]);
  });

  it("agent activ cu un tip primit → valoarea este păstrată, celelalte sunt zero", () => {
    const roster = buildHomezzAgentRoster(members, [], {
      agents: [agent({ 6: { total: "2", remaining: 1, text: "Prima pagina" } })], error: null,
    }, null);
    expect(roster.members[0]!.promotions).toEqual([
      { id: 3, label: "Premium", total: 0, remaining: 0, text: null },
      { id: 6, label: "Prima Pagină", total: 2, remaining: 1, text: "Prima pagina" },
      { id: 9, label: "Top Listă", total: 0, remaining: 0, text: null },
      { id: 7, label: "Reînnoire instant", total: 0, remaining: 0, text: null },
    ]);
  });

  it("rezumatul citește total, allocated și remaining din contract.promos", async () => {
    const data = { contract: { promos: {
      3: { name: "Premium", total: "2", allocated: 0, remaining: 2 },
      6: { name: "Prima pagina", total: "2", allocated: 1, remaining: 1 },
      7: { name: "Reinnoire Instant", total: "2", allocated: 2, remaining: 0 },
      9: { name: "Top Lista", total: "2", allocated: 0, remaining: 2 },
    } } };
    expect(parseHomezzContractPromotions(data)).toEqual([
      { id: 3, label: "Premium", total: 2, allocated: 0, remaining: 2 },
      { id: 6, label: "Prima Pagină", total: 2, allocated: 1, remaining: 1 },
      { id: 9, label: "Top Listă", total: 2, allocated: 0, remaining: 2 },
      { id: 7, label: "Reînnoire instant", total: 2, allocated: 2, remaining: 0 },
    ]);
    const { d, calls } = deps();
    d.post = async (action, params) => { calls.push({ action, params }); return ok(data); };
    expect(await loadHomezzContractPromotions("o", d)).toEqual(parseHomezzContractPromotions(data));
    expect(calls).toEqual([{ action: "details-agency", params: { key: "SECRET-KEY" } }]);
  });

  it("rezumatul este null la refuz sau excepție, fără să blocheze rosterul", async () => {
    const refused = deps().d;
    refused.post = async () => bad("Contract indisponibil");
    expect(await loadHomezzContractPromotions("o", refused)).toBeNull();
    const thrown = deps().d;
    thrown.post = async () => { throw new Error("HomeZZ nu a răspuns"); };
    expect(await loadHomezzContractPromotions("o", thrown)).toBeNull();
  });
});
