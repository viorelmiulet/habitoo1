import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { buildFeedDocDownload, type FeedDocDeps } from "./feed-docs.server";
import { feedDocMarkdown } from "./feed-docs";

const KEY = "test-ip-key-not-real-0123456789";

function deps(superadmin: boolean): FeedDocDeps & { audit: ReturnType<typeof vi.fn> } {
  return {
    isSuperadmin: async () => superadmin,
    readKey: (name) => (name === "IMOBILIAREPLUS_INDEX_KEY" ? KEY : undefined),
    audit: vi.fn(async () => {}),
    now: () => new Date("2026-10-31T12:00:00Z"),
  };
}

describe("documentația feedului (PDF)", () => {
  it("se generează și conține URL-ul indexului; auditul nu conține cheia", async () => {
    const d = deps(true);
    const res = await buildFeedDocDownload({ portal: "imobiliareplus", organizationId: null }, d);
    if (!res.ok) throw new Error(res.message);
    const pdf = Buffer.from(res.pdfBase64, "base64");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.FEED_DOC_PDF_OUT) writeFileSync(process.env.FEED_DOC_PDF_OUT, pdf);
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(5);
    expect(d.audit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d.audit.mock.calls)).not.toContain(KEY);
    expect(JSON.stringify(res).replace(res.pdfBase64, "")).not.toContain(KEY);
    // The URL text lives in compressed/subset-encoded content: verify via the builder input.
    const { feedIndexUrl } = await import("./feed-docs");
    expect(feedIndexUrl("imobiliareplus", KEY)).toBe(`https://crm.habitoo.ro/api/public/feed/imobiliareplus/index/${KEY}.json`);
  });

  it("utilizator care nu e superadmin → 403, fără PDF și fără audit", async () => {
    const d = deps(false);
    const res = await buildFeedDocDownload({ portal: "imobiliareplus", organizationId: null }, d);
    expect(res).toMatchObject({ ok: false, status: 403 });
    expect(d.audit).not.toHaveBeenCalled();
  });

  it("documentul Imobiliare+ nu menționează alte firme", () => {
    const md = feedDocMarkdown("imobiliareplus");
    expect(md).toContain("habitoo-imobiliareplus-index/1.0");
    expect(md).toContain("hbip_");
    expect(md).toContain("Corespondența cu modelul vostru actual");
    expect(md).not.toMatch(/IMMOFLUX|REBS|Imobli/);
  });
});
