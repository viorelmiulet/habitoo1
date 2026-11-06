import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVumsiAdapter } from "../adapters/vumsi.server";
import { resetVumsiClientState } from "./client.server";
import { syncVumsiImages, vumsiStatusDue, vumsiStatusInfo, type VumsiCall, type VumsiStored } from "./publish";
import type { VumsiPreview } from "./preview.server";
import jpegJs from "jpeg-js";
import { encode as encodePng } from "fast-png";
import { toVumsiJpeg, sniffImage, prepareVumsiImage } from "./jpeg";
import { GifWriter } from "omggif";

const rgba = (w: number, h: number) => new Uint8Array(w * h * 4).fill(200);
const JPG = new Uint8Array(jpegJs.encode({ data: rgba(8, 8), width: 8, height: 8 }, 90).data);
const realJpeg = () => new Blob([JPG as BlobPart], { type: "image/jpeg" });

const env = { VUMSI_API_KEY: "vumsi_test_key_123456" };
const json = (status: number, body: unknown) => new Response(JSON.stringify({ status: status < 400 ? "ok" : "error", code: status, data: body }), { status, headers: { "Content-Type": "application/json" } });
const ctx = { organizationId: "o1", allowLiveRequests: true } as never;
const LU = "aaaaaaaa-0000-0000-0000-000000000001";
const body = (tx: "V" | "I") => ({ title: "T", description: "D", type: tx === "V" ? 1 : 3, category: 461, external_id: `HBT-p1-${tx}`, external_user_id: "u1", price: { amount: 1, currency: "EUR" as const }, location: { city_id: 9 }, attrs: {} });
const preview = (txs: ("V" | "I")[] = ["V"]): VumsiPreview => ({
  ok: true, setupMissing: false, reasons: [], warnings: [], cityId: 9, cityName: "X",
  plans: txs.map((t) => ({ transaction: t === "V" ? "sale" : "rent", externalId: `HBT-p1-${t}`, category: { id: 461, name: "A" }, type: 1, attrs: {}, body: body(t), reasons: [] })),
  user: { payload: { email: "a@x.ro", first_name: "A", last_name: "B", phone: null, external_user_id: "u1", account_type: "business" }, vumsiUuid: "uuuu", checked: true },
  company: { payload: { external_company_id: "o1", owner: { user_uuid: "uuuu", external_user_id: "u1" }, name: "X", company_number: "1", city: "C", country: "RO", line1: "S" }, vumsiUuid: "cccc", checked: true },
});

type Route = (method: string, url: string) => Response;
function setup(route: Route, stored: VumsiStored[] = [], extra: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const saved: VumsiStored[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace("https://vumsi.com/api/orion", "");
    calls.push(`${init.method} ${path}`);
    return route(init.method!, path);
  });
  const adapter = createVumsiAdapter({
    env, fetch: fetch as never, sleep: async () => {},
    preview: async () => preview(),
    images: async () => ({ images: [{ source: "img1", url: "https://x/1" }, { source: "img2", url: "https://x/2" }], warnings: [] }),
    fetchImage: async () => realJpeg(),
    loadStored: async () => stored,
    save: async (_o, _p, s) => { saved.push(...s); },
    saveAccount: async () => {},
    propertyState: async () => ({ status: "active", deleted_at: null }),
    ...extra,
  });
  return { adapter, calls, saved, fetch };
}

beforeEach(() => resetVumsiClientState());

describe("publicare Vumsi", () => {
  it("creare: anunțul nu există după external_id → POST, poze, publish", async () => {
    let img = 0;
    const { adapter, calls, saved } = setup((m, p) => {
      if (p.startsWith("/listings/by-external-id/")) return json(404, { errors: "nu" });
      if (m === "POST" && p === "/listings/") return json(201, { uuid: LU, status: 3 });
      if (p.endsWith("/images/")) return json(201, { id: ++img });
      if (p.endsWith("/publish/")) return json(200, { uuid: LU, status: 1, url: "https://vumsi.com/a/1", expires_at: "2026-12-01T00:00:00Z" });
      return json(500, {});
    });
    const r = await adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok && r.data.portalStatus).toBe("pending");
    expect(calls).toEqual(["GET /listings/by-external-id/HBT-p1-V/", "POST /listings/", `POST /listings/${LU}/images/`, `POST /listings/${LU}/images/`, `POST /listings/${LU}/publish/`]);
    expect(saved.at(-1)).toMatchObject({ vumsi_uuid: LU, status: 1, images: [{ source: "img1", id: 1 }, { source: "img2", id: 2 }] });
  });

  it("actualizare: anunțul există → PATCH (fără status), fără POST nou, fără publish dacă e deja publicat", async () => {
    const stored: VumsiStored[] = [{ external_id: "HBT-p1-V", transaction: "sale", vumsi_uuid: LU, status: 2, public_url: null, expires_at: null, images: [{ source: "img1", id: 1 }, { source: "img2", id: 2 }], status_checked_at: null, deleted_at: null }];
    let patchBody: any = null;
    const { adapter, calls } = setup((m, p) => {
      if (p.startsWith("/listings/by-external-id/")) return json(200, { uuid: LU, status: 2 });
      if (m === "PATCH") return json(200, { uuid: LU, status: 2, url: "https://vumsi.com/a/1" });
      return json(500, {});
    }, stored);
    const orig = globalThis.fetch;
    const r = await adapter.updateListing(ctx, { propertyId: "p1", externalId: "HBT-p1-V" });
    globalThis.fetch = orig;
    expect(r.ok && r.data.portalStatus).toBe("published");
    expect(calls).toEqual(["GET /listings/by-external-id/HBT-p1-V/", `PATCH /listings/${LU}/`]);
    void patchBody;
  });

  it("agentul și agenția se creează doar dacă lipsesc după ID-ul nostru", async () => {
    const pv = preview();
    pv.user.vumsiUuid = null; pv.company.vumsiUuid = null;
    const { adapter, calls } = setup((m, p) => {
      if (p === "/users/by-external-id/u1/") return json(200, { uuid: "uuuu" });
      if (p === "/companies/by-external-id/o1/") return json(404, { errors: "nu" });
      if (m === "POST" && p === "/companies/") return json(201, { uuid: "cccc" });
      if (p.startsWith("/listings/by-external-id/")) return json(200, { uuid: LU, status: 2 });
      if (m === "PATCH") return json(200, { uuid: LU, status: 2 });
      if (p.endsWith("/images/")) return json(201, { id: 5 });
      return json(500, {});
    }, [], { preview: async () => pv });
    await adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(calls.slice(0, 3)).toEqual(["GET /users/by-external-id/u1/", "GET /companies/by-external-id/o1/", "POST /companies/"]);
    expect(calls).not.toContain("POST /users/");
  });

  it("blocat fără corespondențe: niciun apel", async () => {
    const { adapter, fetch } = setup(() => json(500, {}), [], { preview: async () => ({ ...preview(), ok: false, setupMissing: true, plans: [], reasons: ["Sincronizează nomenclatoarele Vumsi și setează corespondențele."] }) });
    const r = await adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("Sincronizează nomenclatoarele Vumsi");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("429 → o singură reîncercare", async () => {
    let n = 0;
    const { adapter, calls } = setup(() => { n += 1; return json(429, { errors: "slow" }); });
    const r = await adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    expect(calls).toEqual(["GET /listings/by-external-id/HBT-p1-V/", "GET /listings/by-external-id/HBT-p1-V/"]);
    expect(n).toBe(2);
  });
});

describe("poze Vumsi", () => {
  it("la actualizare se șterg doar pozele scoase și se adaugă cele noi", async () => {
    const calls: string[] = [];
    let id = 100;
    const call: VumsiCall = async (method, path) => { calls.push(`${method} ${path}`); return { ok: true, status: 200, data: (method === "POST" ? { id: ++id } : null) as never }; };
    const r = await syncVumsiImages(call, "L", [{ source: "b", url: "u" }, { source: "c", url: "u" }], [{ source: "a", id: 1 }, { source: "b", id: 2 }], async () => realJpeg());
    expect(calls).toEqual(["DELETE /listings/L/images/1/", "POST /listings/L/images/"]);
    expect(r.ok && r.images).toEqual([{ source: "b", id: 2 }, { source: "c", id: 101 }]);
  });

  it("23 de poze trimise toate, în ordine, cu câmpul order", async () => {
    const orders: string[] = [];
    const call: VumsiCall = async (_m, _p, o) => { orders.push(String(o?.form?.get("order"))); return { ok: true, status: 201, data: { id: orders.length } as never }; };
    const many = Array.from({ length: 23 }, (_, i) => ({ source: `s${i}`, url: "u" }));
    const r = await syncVumsiImages(call, "L", many, [], async () => realJpeg());
    expect(orders).toEqual(Array.from({ length: 23 }, (_, i) => String(i)));
    expect(r.ok && r.images.map((x) => x.source)).toEqual(many.map((m) => m.source));
    expect(r.ok && r.warnings).toEqual([]);
  });

  it("429 cu Retry-After: așteaptă cât cere Vumsi și continuă", async () => {
    let n = 0;
    const sleeps: number[] = [];
    const { adapter, calls } = setup((m, p) => {
      if (p.startsWith("/listings/by-external-id/")) return json(404, { errors: [] });
      if (p.endsWith("/images/")) { n += 1; return n === 1 ? new Response("{}", { status: 429, headers: { "Retry-After": "3" } }) : json(201, { id: n }); }
      if (p.endsWith("/publish/")) return json(200, { uuid: LU, status: 1 });
      return json(201, { uuid: LU, status: 0 });
    }, [], { sleep: async (ms: number) => { sleeps.push(ms); } });
    const r = await adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok && r.data.message).not.toContain("Pozele nu au ajuns");
    expect(calls.some((c) => c.endsWith("/publish/"))).toBe(true);
    expect(sleeps).toContain(3000);
    expect(calls.filter((c) => c.endsWith("/images/"))).toHaveLength(3);
  });

  it("pozele rămase se trimit la salvarea următoare; cele încărcate nu se retrimit", async () => {
    const sent: string[] = [];
    let limit = 2;
    const call: VumsiCall = async (_m, _p, o) => {
      if (limit-- <= 0) return { ok: false, kind: "rate_limited", status: 429, message: "x", transient: true, retryAfterMs: 1000, body: null } as never;
      sent.push(String(o?.form?.get("order"))); return { ok: true, status: 201, data: { id: sent.length } as never };
    };
    const want = Array.from({ length: 4 }, (_, i) => ({ source: `s${i}`, url: "u" }));
    const r1 = await syncVumsiImages(call, "L", want, [], async () => realJpeg());
    expect(r1.ok).toBe(false);
    expect(r1.images.map((x) => x.source)).toEqual(["s0", "s1"]);
    limit = 99; sent.length = 0;
    const r2 = await syncVumsiImages(call, "L", want, r1.images, async () => realJpeg());
    expect(sent).toEqual(["2", "3"]);
    expect(r2.ok && r2.images.map((x) => x.source)).toEqual(["s0", "s1", "s2", "s3"]);
  });
});

describe("retragere Vumsi", () => {
  const live: VumsiStored = { external_id: "HBT-p1-V", transaction: "sale", vumsi_uuid: LU, status: 2, public_url: null, expires_at: null, images: [], status_checked_at: null, deleted_at: null };

  it("la vândut: unpublish, nu DELETE", async () => {
    const { adapter, calls, saved } = setup(() => json(200, { uuid: LU, status: 0 }), [live], { propertyState: async () => ({ status: "sold", deleted_at: null }) });
    const r = await adapter.withdrawListing(ctx, { propertyId: "p1", externalId: "HBT-p1-V", withdrawReason: "sold" });
    expect(r.ok && r.data.portalStatus).toBe("withdrawn");
    expect(calls).toEqual([`POST /listings/${LU}/unpublish/`]);
    expect(saved.at(-1)?.status).toBe(0);
  });

  it("DELETE doar la ștergerea definitivă", async () => {
    const { adapter, calls } = setup(() => json(204, null), [live]);
    await adapter.withdrawListing(ctx, { propertyId: "p1", externalId: "HBT-p1-V", withdrawReason: "hard_deleted" });
    expect(calls).toEqual([`DELETE /listings/${LU}/`]);
  });
});

describe("status Vumsi", () => {
  it("maparea statusurilor", () => {
    expect(vumsiStatusInfo(1).label).toBe("În moderare Vumsi");
    expect(vumsiStatusInfo(2)).toMatchObject({ label: "Publicat", online: true, portalStatus: "published" });
    expect(vumsiStatusInfo(4).label).toBe("Respins de Vumsi");
    expect(vumsiStatusInfo(5).label).toBe("Expirat");
  });

  it("citit cel mult o dată pe minut pe anunț; afișează expires_at și url", async () => {
    const t = Date.parse("2026-10-31T12:00:00Z");
    const s: VumsiStored = { external_id: "HBT-p1-V", transaction: "sale", vumsi_uuid: LU, status: 1, public_url: null, expires_at: null, images: [], status_checked_at: new Date(t - 30_000).toISOString(), deleted_at: null };
    expect(vumsiStatusDue(s, t)).toBe(false);
    expect(vumsiStatusDue(s, t + 31_000)).toBe(true);
    const { adapter, calls } = setup(() => json(200, { uuid: LU, status: 2, url: "https://vumsi.com/a/1", expires_at: "2026-12-01T00:00:00Z" }), [{ ...s, status_checked_at: null }], { now: () => t });
    const r = await adapter.diagnoseListing!(ctx, { propertyId: "p1", externalId: null });
    expect(calls).toEqual([`GET /listings/${LU}/`]);
    expect(r.ok && r.data.offerUrl).toBe("https://vumsi.com/a/1");
    expect(r.ok && r.data.portalState).toBe("online");
    expect(r.ok && r.data.notes[0]).toMatch(/Publicat, expiră 01\.12\.2026/);
  });
});

describe("formatul pozelor Vumsi", () => {
  const webp = () => { const b = new Uint8Array(64); b.set([...new TextEncoder().encode("RIFF")], 0); b.set([...new TextEncoder().encode("WEBP")], 8); return b; };
  const gif = () => { const buf = new Uint8Array(1024); const w = new GifWriter(buf, 4, 4, { palette: [0xff0000, 0x00ff00] }); w.addFrame(0, 0, 4, 4, new Array(16).fill(0)); return buf.slice(0, w.end()); };
  const forms: FormData[] = [];
  const call: VumsiCall = async (_m, _p, o) => { if (o?.form) forms.push(o.form); return { ok: true, status: 201, data: { id: forms.length } as never }; };
  beforeEach(() => { forms.length = 0; });

  it("JPEG, PNG și WebP se trimit neschimbate, cu MIME și extensie corecte", async () => {
    const png = encodePng({ width: 6000, height: 10, data: rgba(6000, 10), channels: 4, depth: 8 });
    const src = [JPG, png, webp()];
    await syncVumsiImages(call, "L", src.map((_, i) => ({ source: `s${i}`, url: String(i) })), [], async (u) => new Blob([src[Number(u)] as BlobPart]));
    const files = forms.map((f) => f.get("image") as File);
    expect(files.map((f) => f.name)).toEqual(["poza-1.jpg", "poza-2.png", "poza-3.webp"]);
    expect(files.map((f) => f.type)).toEqual(["image/jpeg", "image/png", "image/webp"]);
    for (const [i, f] of files.entries()) expect(new Uint8Array(await f.arrayBuffer())).toEqual(src[i]);
  });

  it("GIF se convertește în JPEG", async () => {
    await syncVumsiImages(call, "L", [{ source: "g", url: "u" }], [], async () => new Blob([gif() as BlobPart]));
    const f = forms[0].get("image") as File;
    expect([f.name, f.type]).toEqual(["poza-1.jpg", "image/jpeg"]);
    expect(sniffImage(new Uint8Array(await f.arrayBuffer()))).toBe("jpeg");
  });

  it("fișierul de 26 MB se convertește în JPEG sub 25 MB", () => {
    const w = 1200, h = 1000;
    const data = new Uint8Array(w * h * 4);
    let x = 12345; for (let i = 0; i < data.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; data[i] = x >> 16; }
    const big = new Uint8Array(26 * 1024 * 1024);
    big.set(encodePng({ width: w, height: h, data, channels: 4, depth: 8 }));
    const r = prepareVumsiImage(big);
    expect(r.ok && r.converted).toBe(true);
    expect(r.ok && r.mime).toBe("image/jpeg");
    expect(r.ok && r.bytes.byteLength).toBeLessThanOrEqual(25 * 1024 * 1024);
    expect(r.ok && sniffImage(r.bytes)).toBe("jpeg");
  });

  it("un răspuns non-imagine (HTML) este omis cu avertisment, fără încărcare", async () => {
    const r = await syncVumsiImages(call, "L", [{ source: "a", url: "u" }], [], async () => new Blob(["<!DOCTYPE html><html>Error 500</html>"], { type: "image/jpeg" }));
    expect(forms).toEqual([]);
    expect(r.ok && r.warnings.join(" ")).toContain("nu este o imagine");
    expect(toVumsiJpeg(new TextEncoder().encode("<html>")).ok).toBe(false);
  });

  it("o poză care nu poate fi citită: avertisment păstrat", async () => {
    const r = await syncVumsiImages(call, "L", [{ source: "a", url: "u" }], [], async () => null);
    expect(r.ok && r.warnings).toEqual(["O poză nu a putut fi citită și a fost omisă."]);
  });
});

describe("eroare doar la poze", () => {
  it("nicio poză nu ajunge, anunț nou → nepublicat, mesaj clar; a doua salvare reîncearcă doar pozele", async () => {
    let imgFail = true;
    const store: VumsiStored[] = [];
    const calls: string[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const p = url.replace("https://vumsi.com/api/orion", "");
      calls.push(`${init.method} ${p}`);
      if (p.startsWith("/listings/by-external-id/")) return store.length ? json(200, { uuid: LU, status: 0 }) : json(404, { errors: [] });
      if (p === "/listings/" && init.method === "POST") return json(201, { uuid: LU, status: 0 });
      if (p.endsWith("/images/")) return imgFail ? new Response("<!DOCTYPE html><title>Error 500</title>", { status: 500, headers: { "Content-Type": "text/html" } }) : json(201, { id: 7 });
      if (p.endsWith("/publish/")) return json(200, { uuid: LU, status: 1 });
      return json(200, { uuid: LU, status: 0 });
    });
    const adapter = createVumsiAdapter({
      env, fetch: fetch as never, sleep: async () => {}, preview: async () => preview(),
      images: async () => ({ images: [{ source: "img1", url: "https://x/1" }], warnings: [] }),
      fetchImage: async () => realJpeg(),
      loadStored: async () => store, save: async (_o, _p, s) => { store.splice(0, store.length, ...s); },
      saveAccount: async () => {},
    });
    const r1 = await adapter.publishListing(ctx, { propertyId: "p1" } as never);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.data.portalStatus).not.toBe("published");
      expect(r1.data.message).toContain("Anunțul nu a fost publicat, pentru că nicio poză nu a ajuns la Vumsi. Se reîncearcă la următoarea salvare.");
    }
    expect(calls.some((c) => c.endsWith("/publish/"))).toBe(false);
    expect(calls.filter((c) => c === "POST /listings/")).toHaveLength(1);
    imgFail = false; calls.length = 0;
    const r2 = await adapter.updateListing(ctx, { propertyId: "p1" } as never);
    expect(r2.ok).toBe(true);
    expect(calls.includes("POST /listings/")).toBe(false);
    expect(calls).toContain(`POST /listings/${LU}/images/`);
    expect(calls).toContain(`POST /listings/${LU}/publish/`);
  });
});
