import { afterEach, describe, expect, it, vi } from "vitest";
import jpeg from "jpeg-js";
import { encode as encodePng } from "fast-png";
import { PDFDocument } from "pdf-lib";
import {
  ACP_REPORT_FORMAT_VERSION,
  buildAcpReportModel,
  chunkComparables,
  type AcpReportComparableInput,
  type AcpReportVersionInput,
} from "./model";
import { buildAcpReportPdf } from "./pdf.server";

function comparable(i: number, extra: Partial<AcpReportComparableInput> = {}): AcpReportComparableInput {
  return {
    key: `market:${i}`,
    title: `Apartament ${i}`,
    sourceType: "portal",
    sourceName: "Date piață",
    locationLabel: `Zona ${i}`,
    price: 100_000 + i * 1_000,
    adjustedPrice: 98_000 + i * 1_000,
    adjustedPricePerSqm: 1_500,
    similarityScore: 90 - i,
    tier: "direct",
    adjustmentAmount: -2_000,
    adjustmentPercent: -2,
    adjustments: [],
    isOutlier: false,
    isSelected: true,
    subject: { rooms: 2, usableArea: 60, floor: 3, currency: "EUR", price: 100_000 + i * 1_000 },
    reference: `REF-${i}`,
    status: "active",
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    photos: [`https://img.test/${i}.jpg`],
    ...extra,
  };
}

function version(overrides: Partial<AcpReportVersionInput> = {}): AcpReportVersionInput {
  return {
    analysisId: "a1",
    rootAnalysisId: "a1",
    title: "ACP Test",
    status: "completed",
    errorMessage: null,
    version: 1,
    createdAt: "2026-09-01T10:00:00.000Z",
    snapshotAt: "2026-09-01T10:00:00.000Z",
    authorName: "Autor",
    currency: "EUR",
    target: {
      title: "Apartament 2 camere Militari",
      reference: "HB-1",
      locationLabel: "Militari, București",
      capturedAt: null,
      pricePerSqm: 1_700,
      subject: { propertyType: "apartment", rooms: 2, usableArea: 60, floor: 2, currency: "EUR", price: 105_000 },
      photos: ["https://img.test/subject.jpg", "https://img.test/fails.jpg", "https://img.test/slow.jpg"],
    },
    estimate: { estimatedMin: 95_000, estimatedValue: 101_000, estimatedMax: 107_000, recommendedListingPrice: 104_000 },
    statistics: null,
    confidence: { score: 80 },
    explanation: [],
    comparables: [
      comparable(1, {
        // Ajustare salvată cu factor + una veche doar cu etichetă.
        adjustments: [
          { label: "Etaj", basis: "etaj 3 vs 2", amount: -2_000, factor: "floor" },
          { label: "Suprafață utilă", basis: "+0 mp", amount: 500 },
        ],
        photos: ["https://img.test/1.jpg", "https://img.test/photo.png", "https://img.test/photo.webp"],
      }),
      comparable(2),
      comparable(3),
      comparable(4),
      comparable(5, { status: "inactive", disappearedAt: "2026-08-20T00:00:00.000Z" }),
      comparable(6),
      comparable(7, { isSelected: false }),
    ],
    sources: [],
    ai: null,
    ...overrides,
  };
}

const build = (v = version(), includeAppendix?: boolean) =>
  buildAcpReportModel({
    version: v,
    agency: { name: "Agenția Test", phone: "0700 000 000" },
    reportNumber: 1,
    generatedAt: "2026-09-02T10:00:00.000Z",
    includeAppendix,
    generatedBy: { name: "Ion Agent", role: "Agent imobiliar" },
  });

describe("raport ACP 2.0 — model", () => {
  it("are versiunea formatului 2.0", () => {
    expect(ACP_REPORT_FORMAT_VERSION).toBe("2.0");
    expect(build().formatVersion).toBe("2.0");
  });

  it("împarte comparabilele folosite câte 4 pe pagină", () => {
    const model = build();
    expect(model.used.map((u) => u.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(model.comparisonPages.map((p) => p.columns)).toEqual([[1, 2, 3, 4], [5, 6]]);
    expect(model.comparisonPages[1]!.headers.map((h) => h.label)).toEqual([
      "Proprietatea analizată",
      "Comparabila #5",
      "Comparabila #6",
    ]);
    expect(chunkComparables([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9]]);
  });

  it("ascunde rândurile fără valoare în nicio coloană", () => {
    const labels = build().comparisonPages[0]!.features.map((f) => f.label);
    expect(labels).toEqual(["Camere", "Suprafață utilă", "Etaj"]);
    expect(labels).not.toContain("Etaje bloc");
    expect(labels).not.toContain("Balcon");
  });

  it("afișează rândul când măcar o coloană are valoare", () => {
    const v = version();
    v.comparables[1] = comparable(2, { subject: { rooms: 2, usableArea: 60, totalFloors: 10, currency: "EUR" } });
    const row = build(v).comparisonPages[0]!.features.find((f) => f.label === "Etaje bloc");
    expect(row?.cells.map((c) => c.value)).toEqual(["—", "—", "10", "—", "—"]);
  });

  it("potrivește ajustările pe rânduri, cu 0 unde lipsesc", () => {
    const page = build().comparisonPages[0]!;
    const floor = page.features.find((f) => f.label === "Etaj")!;
    const area = page.features.find((f) => f.label === "Suprafață utilă")!;
    const rooms = page.features.find((f) => f.label === "Camere")!;
    expect(floor.cells[0]!.adjustment).toBeNull();
    expect(floor.cells[1]!.adjustment).toBe("-2.000 €");
    expect(area.cells[1]!.adjustment).toBe("+500 €");
    expect(rooms.cells[1]!.adjustment).toBe("0 €");
    expect(floor.cells[2]!.adjustment).toBe("0 €");
    expect(page.adjusted[0]).toBe("99.000 €");
  });

  it("separă comparabilele inactive și calculează zilele în piață", () => {
    const model = build();
    const inactive = model.used.filter((u) => !u.active);
    expect(inactive.map((u) => u.index)).toEqual([5]);
    expect(inactive[0]!.daysOnMarket).toBe("19 zile");
    expect(inactive[0]!.disappeared).toBe("20.08.2026");
  });

  it("anexa tehnică apare doar când e bifată", () => {
    expect(build().includeAppendix).toBe(false);
    expect(build(version(), false).includeAppendix).toBe(false);
    expect(build(version(), true).includeAppendix).toBe(true);
  });

  it("valoarea estimată: trei carduri, cel din mijloc evidențiat", () => {
    const { cards, listingNote } = build().valuation;
    expect(cards.map((c) => [c.label, c.value, c.highlight])).toEqual([
      ["Preț minim recomandat", "95.000 €", false],
      ["Preț optim", "101.000 €", true],
      ["Preț maxim", "107.000 €", false],
    ]);
    expect(listingNote).toBe("Preț recomandat de listare: 104.000 € (include marja de negociere)");
  });

  it("graficul folosește prețurile ajustate ale comparabilelor folosite", () => {
    const chart = build().priceChart!;
    expect(chart.bars.map((b) => b.value)).toEqual([99_000, 101_500, 101_500, 104_000]);
    expect(chart.recommended?.value).toBe(104_000);
    expect(chart.band).toMatchObject({ min: 95_000, max: 107_000 });
  });

  it("recomandările lipsesc fără interpretare AI", () => {
    expect(build().recommendations).toBeNull();
    const withAi = build(version({ ai: { summary: "Piață stabilă.", model: "m", generatedAt: null } }));
    expect(withAi.recommendations?.groups.map((g) => g.title)).toEqual(["Pe scurt, pentru client"]);
  });

  it("coperta nu menționează sursa datelor și păstrează precizarea ANEVAR", () => {
    const cover = build().cover;
    expect(cover.title).toBe("Raport analiză de piață comparativă");
    expect(cover.photo).toBe("https://img.test/subject.jpg");
    expect(cover.disclaimer).toContain("ANEVAR");
    expect(JSON.stringify(cover).toLowerCase()).not.toContain("immoflux");
  });
});

function sampleJpeg(): Uint8Array {
  const width = 40;
  const height = 30;
  const data = new Uint8Array(width * height * 4).fill(180);
  return new Uint8Array(jpeg.encode({ data, width, height }, 80).data);
}

describe("raport ACP 2.0 — PDF fără rețea", () => {
  afterEach(() => vi.restoreAllMocks());

  it("generează PDF-ul chiar dacă unele poze pică, sunt lente sau în alt format", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("rețea interzisă în test"));
    const png = encodePng({ width: 20, height: 20, data: new Uint8Array(20 * 20 * 4).fill(200), channels: 4 });
    const calls: string[] = [];
    const loadImage = async (url: string) => {
      calls.push(url);
      if (url.endsWith("fails.jpg")) throw new Error("404");
      if (url.endsWith("slow.jpg")) return await new Promise<Uint8Array>(() => {});
      if (url.endsWith(".png")) return png;
      if (url.endsWith(".webp")) return new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
      return sampleJpeg();
    };
    const model = build();
    const bytes = await buildAcpReportPdf(model, { loadImage, imageTimeoutMs: 50 });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(calls).toContain("https://img.test/fails.jpg");
    expect(calls).toContain("https://img.test/slow.jpg");
    const doc = await PDFDocument.load(bytes);
    // copertă + 2 tabele + analiză + preț + valoare + 7 fișe (proprietate + 6)
    expect(doc.getPageCount()).toBe(13);

    const withAppendix = await buildAcpReportPdf(build(version(), true), { loadImage, imageTimeoutMs: 50 });
    expect((await PDFDocument.load(withAppendix)).getPageCount()).toBeGreaterThan(13);
  }, 30_000);
});
