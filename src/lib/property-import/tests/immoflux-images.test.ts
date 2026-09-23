import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  assertAllowedImageUrl,
  downloadImage,
  isUniqueConflict,
  MAX_IMAGE_BYTES,
  placement,
  statusAfterError,
} from "../images.server";

function res(body: BodyInit | null, init: ResponseInit & { headers?: Record<string, string> } = {}) {
  return new Response(body, { status: 200, ...init });
}

describe("descărcare sigură", () => {
  it("refuză http și gazde nepermise", async () => {
    expect(() => assertAllowedImageUrl("http://img.immoflux.ro/a.jpg")).toThrow(/https/);
    expect(() => assertAllowedImageUrl("https://evil.com/a.jpg")).toThrow(/nepermisă/);
    expect(() => assertAllowedImageUrl("https://immoflux.ro.evil.com/a.jpg")).toThrow(/nepermisă/);
    expect(assertAllowedImageUrl("https://cdn.immoflux.ro/a.jpg").hostname).toBe("cdn.immoflux.ro");
    const fetchImpl = vi.fn();
    await expect(downloadImage("https://evil.com/a.jpg", fetchImpl as never)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuză redirecționarea către altă gazdă", async () => {
    const fetchImpl = vi.fn(async () =>
      res(null, { status: 302, headers: { location: "https://evil.com/x.jpg" } }),
    );
    await expect(downloadImage("https://cdn.immoflux.ro/a.jpg", fetchImpl as never)).rejects.toThrow(
      /nepermisă/,
    );
  });

  it("refuză tipurile non-imagine", async () => {
    const fetchImpl = vi.fn(async () => res("<html>", { headers: { "content-type": "text/html" } }));
    await expect(downloadImage("https://cdn.immoflux.ro/a.jpg", fetchImpl as never)).rejects.toThrow(
      /Tip de conținut/,
    );
  });

  it("refuză peste 10 MB după Content-Length", async () => {
    const fetchImpl = vi.fn(async () =>
      res("x", {
        headers: { "content-type": "image/jpeg", "content-length": String(MAX_IMAGE_BYTES + 1) },
      }),
    );
    await expect(downloadImage("https://cdn.immoflux.ro/a.jpg", fetchImpl as never)).rejects.toThrow(
      /10 MB/,
    );
  });

  it("refuză peste 10 MB după octeții citiți efectiv", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 10);
    const fetchImpl = vi.fn(async () => res(big, { headers: { "content-type": "image/jpeg" } }));
    await expect(downloadImage("https://cdn.immoflux.ro/a.jpg", fetchImpl as never)).rejects.toThrow(
      /10 MB/,
    );
  });

  it("acceptă o imagine validă", async () => {
    const fetchImpl = vi.fn(async () =>
      res(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }),
    );
    const out = await downloadImage("https://cdn.immoflux.ro/a.jpg", fetchImpl as never);
    expect(out.bytes.byteLength).toBe(3);
    expect(out.contentType).toBe("image/jpeg");
  });
});

describe("decizii de stare", () => {
  it("după eroare: pending până la a treia încercare, apoi failed", () => {
    expect(statusAfterError(1)).toBe("pending");
    expect(statusAfterError(2)).toBe("pending");
    expect(statusAfterError(3)).toBe("failed");
  });

  it("position după pozele existente, is_primary doar fără copertă", () => {
    expect(placement([])).toEqual({ position: 0, isPrimary: true });
    expect(
      placement([
        { position: 0, is_primary: true },
        { position: 4, is_primary: false },
      ]),
    ).toEqual({ position: 5, isPrimary: false });
    expect(placement([{ position: 2, is_primary: false }])).toEqual({ position: 3, isPrimary: true });
  });

  it("conflictul de unicitate este recunoscut (→ done)", () => {
    expect(isUniqueConflict({ code: "23505" })).toBe(true);
    expect(isUniqueConflict({ code: "42501" })).toBe(false);
    expect(isUniqueConflict(null)).toBe(false);
  });
});

import { isDeadRow } from "../images.server";

describe("rânduri moarte", () => {
  const now = new Date("2026-09-23T20:00:00Z");
  it("pending cu 3 încercări și lock expirat/nul → închis", () => {
    expect(isDeadRow({ status: "pending", attempts: 3, locked_until: "2026-09-23T19:59:00Z" }, now)).toBe(true);
    expect(isDeadRow({ status: "pending", attempts: 3, locked_until: null }, now)).toBe(true);
  });
  it("încă blocat, încercări rămase sau alt status → neatins", () => {
    expect(isDeadRow({ status: "pending", attempts: 3, locked_until: "2026-09-23T20:01:00Z" }, now)).toBe(false);
    expect(isDeadRow({ status: "pending", attempts: 2, locked_until: null }, now)).toBe(false);
    expect(isDeadRow({ status: "failed", attempts: 3, locked_until: null }, now)).toBe(false);
  });
});
