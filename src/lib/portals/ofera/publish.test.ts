import { describe, it, expect, vi } from "vitest";
import { oferaTransport } from "./transport.server";
import { writeOferaBody, withdrawOfera, oferaImagesFingerprint, oferaValidUntil, oferaExpired, OFERA_UNCONFIRMED, type OferaState } from "./publish";
import type { OferaBody } from "./mapper";
import { decideJobResult } from "../publish-jobs.server";
import { TIMEOUT_RETRY_PORTALS } from "../transient-failure";
const body: OferaBody = { category_id: 94, id_furnizor: 486, title: "Apartament test", description: "Descriere test", city_id: 179132, params: { price: 100000 }, images: [{ url: "https://example.invalid/1.jpg", order: 0 }, { url: "https://example.invalid/2.jpg", order: 1 }], contact: { tip: "business", name: "Test", email: "test@example.invalid", phone: "0700000000" }, external_id: "HB-1-v", promoted: 0 };
const ok = (data: unknown = {}) => ({ code: "SUCCESS", status: 200, message: "Confirmat", data });
const error = (status: number, data: unknown = {}) => ({ code: "ERROR", status, message: "Refuz Ofera", data });
function fixture(replies: unknown[]) {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(replies.shift()), { status: 200 }));
  const saved: OferaState[] = [];
  const journal = vi.fn(async () => {});
  const deps = { call: async (method: "POST" | "PUT" | "DELETE", path: string, payload?: unknown) => (await oferaTransport(path, { method, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) }, { fetch: fetcher, journal })).result, save: async (state: OferaState) => { saved.push({ ...state }); } };
  return { fetcher, saved, journal, deps };
}
const existing = async (status: OferaState["status"] = "active"): Promise<OferaState> => ({ transaction: "sale", external_id: "HB-1-v", ofera_id: 52, public_url: "https://www.ofera.ro/anunt-real", valid_until: "2099-10-29", status, images_fingerprint: await oferaImagesFingerprint(body.images), last_log_track_id: null, last_message: null });
const payload = (f: ReturnType<typeof fixture>, index = 0) => JSON.parse(String(f.fetcher.mock.calls[index]?.[1]?.body));
describe("Ofera publishing with real HTTP 200 envelope fixtures", () => {
  it("create + activation saves id, received URL, validity and fingerprint", async () => {
    const f = fixture([ok({ id: 52, url: "https://www.ofera.ro/anunt-real", valabilitate: "29.10.2026", log_track_id: 12 }), ok({ log_track_id: 13 })]);
    const r = await writeOferaBody(body, undefined, f.deps);
    expect(r.ok).toBe(true); expect(r.states[0]).toMatchObject({ ofera_id: 52, public_url: "https://www.ofera.ro/anunt-real", valid_until: "2026-10-29", status: "active", last_log_track_id: "13" });
    expect(r.states[0]?.images_fingerprint).toBe(await oferaImagesFingerprint(body.images));
    expect(f.fetcher.mock.calls.map(c => [String(c[0]).split('/v2.1')[1], c[1]?.method])).toEqual([["/create-product", "POST"], ["/activate-product/52", "POST"]]);
    expect(f.saved.map(s => s.status)).toEqual(["unconfirmed", "pending_activation", "active"]);
  });
  it("HTTP 200 ERROR at create never saves a remote ID or activates", async () => { const f = fixture([error(500)]); const r = await writeOferaBody(body, undefined, f.deps); expect(r.ok).toBe(false); expect(r.states).toEqual([]); expect(f.saved.every(s => s.ofera_id === null)).toBe(true); expect(f.fetcher).toHaveBeenCalledTimes(1); });
  it("activation rejected keeps pending_activation, portal message and track", async () => { const f = fixture([ok({ id: 52 }), error(412, { log_track_id: "a" })]); const r = await writeOferaBody(body, undefined, f.deps); expect(r.ok).toBe(false); expect(r.states[0]).toMatchObject({ ofera_id: 52, status: "pending_activation", last_log_track_id: "a" }); expect(r.message).toContain("Referință Ofera: a"); });
  it("activation 409 exposes duplicate ID and original message", async () => { const f = fixture([ok({ id: 52 }), error(409, { id_duplicat: 77 })]); const r = await writeOferaBody(body, undefined, f.deps); expect(r.message).toContain("ID 77"); expect(r.message).toContain("Refuz Ofera"); });
  it("pending retry makes activation only, with no gallery/body update", async () => { const f = fixture([ok()]); const r = await writeOferaBody(body, await existing("pending_activation"), f.deps, "activate"); expect(r.ok).toBe(true); expect(f.fetcher).toHaveBeenCalledTimes(1); expect(f.fetcher.mock.calls[0]?.[1]?.body).toBeUndefined(); expect(String(f.fetcher.mock.calls[0]?.[0])).toContain("activate-product/52"); });
  it("create timeout remains unconfirmed, no automatic retry", async () => {
    const f = fixture([]); f.fetcher.mockImplementation(async () => { throw new DOMException("Timeout", "AbortError"); });
    const r = await writeOferaBody(body, undefined, f.deps);
    expect(r).toMatchObject({ ok: false, unconfirmed: true, message: OFERA_UNCONFIRMED }); expect(f.saved.at(-1)?.status).toBe("unconfirmed"); expect(f.fetcher).toHaveBeenCalledTimes(1);
    const next = await writeOferaBody(body, f.saved.at(-1), f.deps); expect(next.ok).toBe(false); expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(TIMEOUT_RETRY_PORTALS.has("ofera")).toBe(false);
    expect(decideJobResult({ attempts: 1, portal_key: "ofera" }, { portalId: "ofera", ok: false, code: "TIMEOUT", message: OFERA_UNCONFIRMED }, undefined).status).toBe("error");
  });
  it("confirmed resend creates only after explicit intent", async () => { const f = fixture([ok({ id: 52 }), ok()]); const state = { ...await existing("unconfirmed"), ofera_id: null }; expect((await writeOferaBody(body, state, f.deps, "resend")).ok).toBe(true); expect(f.fetcher).toHaveBeenCalledTimes(2); });
  it("unchanged images omitted from update", async () => { const f = fixture([ok()]); await writeOferaBody(body, await existing(), f.deps); expect(payload(f)).not.toHaveProperty("images"); });
  it("changed images sent completely", async () => { const f = fixture([ok()]); const updated = { ...body, images: [...body.images].reverse() }; await writeOferaBody(updated, await existing(), f.deps); expect(payload(f).images).toEqual(updated.images); });
  it("changed watermark/file identity resends unchanged public URLs", async () => { const f = fixture([ok()]); await writeOferaBody(body, await existing(), { ...f.deps, imagesFingerprint: "changed-file-or-watermark" }); expect(payload(f).images).toEqual(body.images); });
  it("update 404 recreates and activates", async () => { const f = fixture([error(404), ok({ id: 53 }), ok()]); const r = await writeOferaBody(body, await existing(), f.deps); expect(r.states[0]?.ofera_id).toBe(53); expect(f.fetcher.mock.calls.map(c => c[1]?.method)).toEqual(["PUT", "POST", "POST"]); expect(payload(f, 1).images).toEqual(body.images); });
  it("inactive republish PUT then activation", async () => { const f = fixture([ok(), ok()]); const r = await writeOferaBody(body, await existing("inactive"), f.deps); expect(r.states[0]?.status).toBe("active"); expect(f.fetcher.mock.calls.map(c => c[1]?.method)).toEqual(["PUT", "POST"]); });
  it("expiry republish PUT then activation, no automatic renewal", async () => { const f = fixture([ok(), ok()]); const r = await writeOferaBody(body, { ...await existing(), valid_until: "2025-01-01" }, f.deps); expect(r.states[0]?.status).toBe("active"); expect(f.fetcher).toHaveBeenCalledTimes(2); expect(oferaExpired({ valid_until: "2026-10-28" }, new Date("2026-10-29T00:00:00Z"))).toBe(true); expect(oferaExpired({ valid_until: "2026-10-29" }, new Date("2026-10-29T00:00:00Z"))).toBe(false); });
  it("deselect or soft-delete deactivates, never DELETE", async () => { const f = fixture([ok()]); const r = await withdrawOfera([await existing()], false, f.deps); expect(r.states[0]?.status).toBe("inactive"); expect(f.fetcher.mock.calls[0]?.[1]?.method).toBe("POST"); expect(String(f.fetcher.mock.calls[0]?.[0])).toContain("deactivate-product/52"); });
  it("hard-delete DELETE, 404 success", async () => { const f = fixture([error(404)]); const r = await withdrawOfera([await existing()], true, f.deps); expect(r.ok).toBe(true); expect(r.states[0]?.status).toBe("deleted"); expect(f.fetcher.mock.calls[0]?.[1]?.method).toBe("DELETE"); });
  it("promoted flag sends 1 without promote-product", async () => { const f = fixture([ok({ id: 52 }), ok()]); await writeOferaBody({ ...body, promoted: 1 }, undefined, f.deps); expect(payload(f).promoted).toBe(1); expect(f.fetcher.mock.calls.every(c => !String(c[0]).includes('/promote-product'))).toBe(true); });
  it("406 falls back to unpromoted, clears checkbox and retains portal warning", async () => { const f = fixture([error(406), ok({ id: 52 }), ok()]); const r = await writeOferaBody({ ...body, promoted: 1 }, undefined, f.deps); expect(r).toMatchObject({ ok: true, promotedConfirmed: false }); expect(r.states[0]?.status).toBe("active"); expect(payload(f, 1).promoted).toBe(0); expect(r.message).toContain("Refuz Ofera"); });
  it("406 with a created ID updates instead of duplicate create, then activates", async () => { const f = fixture([error(406, { id: 52 }), ok(), ok()]); const r = await writeOferaBody({ ...body, promoted: 1 }, undefined, f.deps); expect(r.ok).toBe(true); expect(f.fetcher.mock.calls.map(c => c[1]?.method)).toEqual(["POST", "PUT", "POST"]); });
  it("sale+rent keeps two independent IDs", async () => { const f = fixture([ok({ id: 52 }), ok(), ok({ id: 53 }), ok()]); const a = await writeOferaBody(body, undefined, f.deps); const b = await writeOferaBody({ ...body, external_id: "HB-1-i" }, undefined, f.deps); expect([a.states[0]?.transaction, b.states[0]?.transaction]).toEqual(["sale", "rent"]); expect([a.states[0]?.ofera_id, b.states[0]?.ofera_id]).toEqual([52, 53]); });
  it("validity rejects impossible calendar date", () => { expect(oferaValidUntil("31.02.2026")).toBeNull(); expect(oferaValidUntil("29.10.2026")).toBe("2026-10-29"); });
  it("missing public URL stays null and is never constructed", async () => { const f = fixture([ok({ id: 52 }), ok()]); const r = await writeOferaBody(body, undefined, f.deps); expect(r.states[0]?.public_url).toBeNull(); });
});