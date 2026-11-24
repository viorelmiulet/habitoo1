import { describe, expect, it } from "vitest";
import { homezzPost, type HomezzParams, type HomezzResult } from "./client";
import { homezzPromotionButtons, parseHomezzCheckPromotions, HOMEZZ_PROMOTION_UNKNOWN } from "./promotions";
import { loadHomezzPromotions, promoteHomezzAd, stopHomezzPromotion, type HomezzPromoDeps } from "./promotions.server";
import { setHomezzAgentPromotions, syncHomezzAgentSlots, type HomezzAgentDeps } from "./agents.server";
import { encodeHomezzForm } from "./client";

const KEY = "SECRET-KEY-77", TOKEN = "SECRET-TOKEN-88";
type Reply = (params: HomezzParams) => Response | "timeout";

function world(replies: Record<string, Reply>) {
  const calls: { action: string; params: HomezzParams }[] = [];
  const logs: unknown[] = [];
  let offers: unknown[] = [{ transaction: "sale", internal_id: "13761", agent_email: "a@x.ro", deleted: false }];
  const json = (code: number, data: unknown, message = "ok") => new Response(JSON.stringify({ meta: { code, message }, data }), { status: code === 200 ? 200 : code });
  const transport = async (url: string, init: RequestInit) => {
    const action = url.split("/").pop()!;
    const params = Object.fromEntries(new URLSearchParams(String(init.body)));
    calls.push({ action, params });
    const r = replies[action];
    const out = r ? r(params) : json(200, {});
    if (out === "timeout") { const e = new Error("timeout"); e.name = "TimeoutError"; throw e; }
    return out;
  };
  const deps: HomezzPromoDeps = {
    now: () => new Date("2026-11-24T20:00:00Z"),
    post: (a, p) => homezzPost(a, p, transport),
    agencyKey: async () => KEY,
    withToken: async (_o, _e, run) => run(TOKEN),
    loadListing: async () => ({ id: "PL", status: "published", portal_offers: offers }),
    saveOffers: async (_id, o) => { offers = o; },
    log: async (e) => { logs.push(e); },
  };
  return { deps, calls, logs, json, count: (a: string) => calls.filter((c) => c.action === a).length };
}
const okJson = (data: unknown) => new Response(JSON.stringify({ meta: { code: 200, message: "ok" }, data }), { status: 200 });

describe("HomeZZ promovări pe anunț", () => {
  it("butoane active doar pentru tipurile disponibile (inclusiv cele oprite)", () => {
    const av = parseHomezzCheckPromotions({ promotions: { 3: { remaining: 2, text: "Premium" } }, cancelled_promotions: [{ promotion_id: 9 }] });
    const b = homezzPromotionButtons(av);
    expect(b.filter((x) => x.enabled).map((x) => x.label)).toEqual(["Premium", "Top Listă"]);
    expect(b.find((x) => x.id === 6)!.enabled).toBe(false);
  });

  it("starea citită cel mult o dată pe minut", async () => {
    const w = world({ "my-ads": () => okJson({ internal_id: "13761", promotion_id: 3, start_date: "2026-11-20", end_date: "2026-12-20" }), "check-promotions": () => okJson({ promotions: { 6: 1 } }) });
    const r = await loadHomezzPromotions(w.deps, "o", "p");
    expect(r![0]!.active!.label).toBe("Premium");
    await loadHomezzPromotions(w.deps, "o", "p");
    expect(w.count("my-ads")).toBe(1);
  });

  it("fără confirmare → niciun apel", async () => {
    const w = world({});
    await expect(promoteHomezzAd(w.deps, { organizationId: "o", propertyId: "p", internalId: "13761", promotionId: 3, confirmed: false })).rejects.toThrow();
    await expect(stopHomezzPromotion(w.deps, { organizationId: "o", propertyId: "p", internalId: "13761", promotionId: 3, confirmed: false })).rejects.toThrow();
    expect(w.calls).toEqual([]);
  });

  it("promote trimis o singură dată; la timeout urmează my-ads cu starea reală", async () => {
    const w = world({ promote: () => "timeout", "my-ads": () => okJson({ internal_id: "13761", promotion_id: 3 }), "check-promotions": () => okJson({ promotions: {} }) });
    const r = await promoteHomezzAd(w.deps, { organizationId: "o", propertyId: "p", internalId: "13761", promotionId: 3, confirmed: true });
    expect(w.count("promote")).toBe(1);
    expect(w.count("my-ads")).toBeGreaterThanOrEqual(1);
    expect(r.message).toContain("Premium activă");
  });

  it("timeout și my-ads ilizibil → mesajul de incertitudine", async () => {
    const w = world({ promote: () => "timeout", "my-ads": () => "timeout", "check-promotions": () => "timeout" });
    const r = await promoteHomezzAd(w.deps, { organizationId: "o", propertyId: "p", internalId: "13761", promotionId: 7, confirmed: true });
    expect(w.count("promote")).toBe(1);
    expect(r.message).toBe(HOMEZZ_PROMOTION_UNKNOWN);
  });

  it("oprire cu new_internal_id=0 și jurnal cu mesajul exact, fără token și cheie", async () => {
    const w = world({ "replace-ad-promotion": (p) => new Response(JSON.stringify({ meta: { code: 400, message: `Promovare inexistenta key=${p["key"]}` }, data: {} }), { status: 400 }), "promote": () => new Response(JSON.stringify({ meta: { code: 400, message: "Nu mai aveti promovari" }, data: {} }), { status: 400 }) });
    const r = await stopHomezzPromotion(w.deps, { organizationId: "o", propertyId: "p", internalId: "13761", promotionId: 3, confirmed: true });
    const call = w.calls.find((c) => c.action === "replace-ad-promotion")!;
    expect(call.params).toMatchObject({ old_internal_id: "13761", new_internal_id: "0", promotion_id: "3" });
    expect(r.ok).toBe(false);
    await promoteHomezzAd(w.deps, { organizationId: "o", propertyId: "p", internalId: "13761", promotionId: 3, confirmed: true });
    const logged = JSON.stringify(w.logs);
    expect(logged).toContain("Nu mai aveti promovari");
    expect(logged).toContain("promote_stop");
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(TOKEN);
  });
});

describe("HomeZZ promovări și sloturi per agent", () => {
  const ok: HomezzResult = { ok: true, status: 200, message: "", data: {}, raw: "" };
  function agentDeps(linked: string | null) {
    const posts: { action: string; params: HomezzParams }[] = [];
    const deps: HomezzAgentDeps = {
      post: async (action, params) => { posts.push({ action, params }); return ok; },
      agencyKey: async () => KEY, member: async () => null, allocation: async () => null,
      link: async () => undefined, audit: async () => undefined,
      linkedEmail: async () => linked, auditPromotions: async () => undefined,
    };
    return { deps, posts };
  }

  it("modificarea alocării de promovări → edit-agent cu promotions[tip]", async () => {
    const a = agentDeps("a@x.ro");
    await setHomezzAgentPromotions("o", "admin", "u1", { 3: 5 }, a.deps);
    expect(a.posts).toHaveLength(1);
    expect(a.posts[0]!.action).toBe("edit-agent");
    expect(encodeHomezzForm(a.posts[0]!.params)).toContain("promotions%5B3%5D=5");
  });

  it("schimbarea sloturilor → edit-agent cu ads doar pentru agenți activați", async () => {
    const on = agentDeps("a@x.ro");
    expect((await syncHomezzAgentSlots("o", "u1", 7, on.deps)).sent).toBe(true);
    expect(on.posts[0]).toMatchObject({ action: "edit-agent", params: { email: "a@x.ro", ads: 7 } });
    const off = agentDeps(null);
    expect((await syncHomezzAgentSlots("o", "u2", 7, off.deps)).sent).toBe(false);
    expect(off.posts).toEqual([]);
  });

  it("eșec HomeZZ la sloturi → avertisment, fără excepție", async () => {
    const a = agentDeps("a@x.ro");
    a.deps.post = async () => ({ ok: false, kind: "action_error", status: 400, message: "Depasire contract", adError: null, retryable: false, raw: "" });
    const r = await syncHomezzAgentSlots("o", "u1", 99, a.deps);
    expect(r.warning).toContain("Depasire contract");
  });
});
