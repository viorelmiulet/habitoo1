import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOMEZZ_NO_ALLOCATION, activateHomezzAgent, clearHomezzTokenCache, getHomezzAgentToken, isValidHomezzPassword,
  withHomezzAgentToken, type HomezzAgentDeps,
} from "./agents.server";
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
