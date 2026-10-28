import { describe, expect, it } from "vitest";
import { encode } from "fast-png";
import { fitZoom, layoutMap, project, snapshotGeo, MAP_PIN_OVERLAP, MAP_STREET_ZOOM } from "./map";
import { loadMapTiles } from "./map.server";

const militari = { lat: 44.4355, lng: 25.9998 };
const pin = (lat: number, lng: number, i: number) => ({ lat, lng, id: `c${i}`, label: `#${i}`, kind: "comparable" as const });

describe("hărțile raportului ACP", () => {
  it("acceptă doar coordonatele valide din snapshot", () => {
    expect(snapshotGeo({ latitude: 44.43, longitude: 26.1 })).toEqual({ lat: 44.43, lng: 26.1 });
    expect(snapshotGeo({ latitude: null, longitude: 26.1 })).toBeNull();
    expect(snapshotGeo({})).toBeNull();
    expect(snapshotGeo({ latitude: 0, longitude: 0 })).toBeNull();
    expect(snapshotGeo({ latitude: 95, longitude: 26 })).toBeNull();
  });

  it("încadrează toate punctele cu margine și alege cel mai mare zoom posibil", () => {
    const pts = [militari, { lat: 44.45, lng: 26.05 }];
    const z = fitZoom(pts, 515, 470, { padding: 36, tileSize: 200 });
    const span = (zz: number) => (project(pts[1]!, zz).x - project(pts[0]!, zz).x) * (200 / 256);
    expect(span(z)).toBeLessThanOrEqual(515 - 72);
    expect(span(z + 1)).toBeGreaterThan(515 - 72);
    const layout = layoutMap(pts.map((p, i) => pin(p.lat, p.lng, i + 1)), 515, 470, { padding: 36, tileSize: 200 })!;
    for (const p of layout.pins) {
      expect(p.x).toBeGreaterThanOrEqual(36);
      expect(p.x).toBeLessThanOrEqual(515 - 36);
      expect(p.y).toBeGreaterThanOrEqual(36);
      expect(p.y).toBeLessThanOrEqual(470 - 36);
    }
    // Tile-urile acoperă tot cadrul.
    expect(Math.min(...layout.tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.max(...layout.tiles.map((t) => t.left + t.size))).toBeGreaterThanOrEqual(515);
  });

  it("numerotează pinii ca în tabel și pune proprietatea analizată separat", () => {
    const layout = layoutMap(
      [{ ...militari, id: "subject", label: "", kind: "subject" }, pin(44.44, 26.0, 1), pin(44.43, 26.01, 2)],
      515,
      470,
    )!;
    expect(layout.pins.map((p) => [p.kind, p.label])).toEqual([
      ["subject", ""],
      ["comparable", "#1"],
      ["comparable", "#2"],
    ]);
  });

  it("puncte identice → zoom de stradă și pini decalați vizibil", () => {
    const layout = layoutMap([pin(militari.lat, militari.lng, 1), pin(militari.lat, militari.lng, 2), pin(militari.lat, militari.lng, 3)], 515, 470)!;
    expect(layout.zoom).toBe(MAP_STREET_ZOOM);
    expect(layout.pins.every((p) => p.offset)).toBe(true);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++)
        expect(Math.hypot(layout.pins[i]!.x - layout.pins[j]!.x, layout.pins[i]!.y - layout.pins[j]!.y)).toBeGreaterThanOrEqual(MAP_PIN_OVERLAP);
  });

  it("fără puncte nu există hartă", () => {
    expect(layoutMap([], 515, 470)).toBeNull();
  });

  it("tile-urile care nu sosesc în limita de timp rămân lipsă, fără excepții", async () => {
    const png = encode({ width: 1, height: 1, data: new Uint8Array([200, 200, 200, 255]), channels: 4 });
    const fast = await loadMapTiles([{ z: 1, x: 0, y: 0 }], async () => png, 200);
    expect(fast.get("1/0/0")).toBeInstanceOf(Uint8Array);
    const slow = await loadMapTiles([{ z: 1, x: 0, y: 0 }], () => new Promise(() => {}), 50);
    expect(slow.get("1/0/0") ?? null).toBeNull();
    const failing = await loadMapTiles([{ z: 1, x: 0, y: 0 }], async () => {
      throw new Error("down");
    }, 200);
    expect(failing.get("1/0/0") ?? null).toBeNull();
  });
});
