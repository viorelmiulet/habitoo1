import { describe, expect, it } from "vitest";
import { DAILY_TIPS, tipOfTheDay } from "./daily-tips";
import { dailyAdditions, monthComparison, trendLabel } from "./home-stats";

describe("Acasă — sfatul zilei", () => {
  it("are cel puțin 60 de sfaturi diferite", () => {
    expect(new Set(DAILY_TIPS).size).toBeGreaterThanOrEqual(60);
  });
  it("același sfat toată ziua, altul a doua zi", () => {
    expect(tipOfTheDay(new Date(2026, 10, 6, 8))).toBe(tipOfTheDay(new Date(2026, 10, 6, 22)));
    expect(tipOfTheDay(new Date(2026, 10, 6))).not.toBe(tipOfTheDay(new Date(2026, 10, 7)));
  });
});

describe("Acasă — comparația cu luna trecută", () => {
  it("+48%, la fel, -10%", () => {
    expect(trendLabel(37, 25)).toEqual({ text: "+48% față de luna trecută", tone: "up" });
    expect(trendLabel(5, 5)).toEqual({ text: "La fel ca luna trecută", tone: "same" });
    expect(trendLabel(9, 10)).toEqual({ text: "-10% față de luna trecută", tone: "down" });
  });
  it("împarte adăugările pe ultimele 30 de zile și cele 30 dinainte", () => {
    const now = new Date(2026, 10, 6, 12);
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
    expect(monthComparison([ago(1), ago(29), ago(31), ago(70)], now)).toEqual({ current: 2, previous: 1 });
  });
  it("evoluția pe 14 zile se termină cu azi", () => {
    const now = new Date(2026, 10, 6, 12);
    const series = dailyAdditions([now.toISOString(), now.toISOString(), new Date(2026, 10, 5, 9).toISOString()], now);
    expect(series).toHaveLength(14);
    expect(series[13]).toBe(2);
    expect(series[12]).toBe(1);
  });
});
