import { describe, expect, it, vi } from "vitest";
import { publicRead } from "./public-read";
import { buildLlmsTxt } from "./blog-discovery";
import { ownerStatisticsText } from "@/components/marketing/owner-listings-content";
import { publicMarketText } from "@/components/marketing/acp-content";

describe("publicRead", () => {
  it("returns the fallback and logs when a read times out", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await publicRead("stats", () => new Promise<number>(() => {}), -1, 20);
    expect(result).toBe(-1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("timeout"));
    log.mockRestore();
  });
  it("returns the fallback when a read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await publicRead("x", async () => { throw new Error("boom"); }, "f")).toBe("f");
  });
  it("returns data when the read succeeds", async () => {
    expect(await publicRead("x", async () => 5, 0)).toBe(5);
  });
  it("pages and llms.txt render without dynamic figures when statistics are missing", () => {
    const txt = buildLlmsTxt([], new Date(), false, null);
    expect(txt).toContain("## Prețuri și acces");
    expect(txt).not.toContain("## Cifre");
    expect(ownerStatisticsText(null, new Date().toISOString())).not.toMatch(/\d/);
    expect(publicMarketText(null, new Date().toISOString())).not.toMatch(/\d/);
  });
});
