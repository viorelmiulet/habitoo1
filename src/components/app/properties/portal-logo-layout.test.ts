import { describe, expect, it } from "vitest";
import { portalLogoLayout } from "./portal-logo-layout";

describe("portal logo geometry", () => {
  it.each([
    { count: 5, columns: 2, rows: 3, visible: 5, hidden: 0 },
    { count: 13, columns: 5, rows: 3, visible: 13, hidden: 0 },
    { count: 17, columns: 6, rows: 3, visible: 17, hidden: 0 },
    { count: 30, columns: 8, rows: 3, visible: 23, hidden: 7 },
  ])("fits $count portals within the 96px photo", ({ count, columns, rows, visible, hidden }) => {
    const layout = portalLogoLayout(count, 96);
    expect(layout.columns).toBe(columns);
    expect(layout.rows).toBe(rows);
    expect(layout.visibleCount).toBe(visible);
    expect(layout.hiddenCount).toBe(hidden);
    expect(layout.boxSize).toBe(22);
    expect(layout.logoSize).toBe(16);
    expect(layout.dotSize).toBe(6);
    expect(layout.height).toBe(94);
    expect(layout.height).toBeLessThanOrEqual(96);
  });
  it("replaces the last slot only above 24 portals", () => {
    expect(portalLogoLayout(24).hiddenCount).toBe(0);
    expect(portalLogoLayout(25).hiddenCount).toBe(2);
  });
  it("limits narrow cards to the available width, including paired logos", () => {
    const layout = portalLogoLayout(30, 120, 100, Array.from({ length: 30 }, () => 2));
    expect(layout.columns).toBe(2);
    expect(layout.visibleCount).toBe(5);
    expect(layout.hiddenCount).toBe(25);
    expect(layout.rows).toBe(3);
    expect(layout.width).toBe(96);
    expect(layout.height).toBeLessThanOrEqual(120);
  });
  it("sizes all three rows from a shorter photo", () => {
    const layout = portalLogoLayout(17, 72);
    expect(layout.boxSize).toBe(14);
    expect(layout.height).toBe(70);
    expect(layout.height).toBeLessThanOrEqual(72);
  });
});