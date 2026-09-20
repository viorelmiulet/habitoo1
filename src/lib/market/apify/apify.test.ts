/**
 * Teste pentru ingestia Apify: maparea, respingerile, calea existentă de
 * deduplicare/istoric, refuzurile de politică și izolarea tokenului.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createFakeRepository } from "../__tests__/fake-repository";
import {
  classifySellerType,
  collectImageUrls,
  mapApifyItems,
  parseListingDate,
  summarizeDiscards,
} from "./mapping";
import {
  APIFY_RUN_IN_PROGRESS,
  APIFY_SOURCE_DISABLED,
  APIFY_PROSPECT_ORG_MISSING,
  runApifySourceImport,
  type ApifyRunDeps,
  type ApifySourceConfig,
} from "./run";
import { APIFY_TOKEN_MISSING } from "./token-message";
import { apifyMarketSourceId, estimateApifyCost, sumCosts } from "./source";
import { readApifyDataset, waitForApifyRun } from "./client.server";

/** Element capturat din rezultatul unui actor Apify de anunțuri imobiliare. */
const SAMPLE_ITEM = {
  id: "ap-1001",
  url: "https://example.ro/anunt/ap-1001",
  title: "Apartament 2 camere, Militari",
  price: 89500,
  currency: "EUR",
  usable_area: 54.5,
  rooms: 2,
  city: "București",
  county: "București",
  district: "Sectorul 6",
  isBusiness: true,
  publishedAt: "2026-02-14T10:00:00.000Z",
  images: [
    { url: "https://example.ro/img/1.jpg" },
    { url: "https://example.ro/img/2.jpg" },
  ],
  propertyType: "apartament",
  transactionType: "vanzare",
  phone: "0722000000",
};

const SOURCE_ID = apifyMarketSourceId("demo");

function source(overrides: Partial<ApifySourceConfig> = {}): ApifySourceConfig {
  return {
    key: "demo",
    label: "Demo",
    actorId: "user~actor",
    input: { startUrls: [] },
    fieldMapping: {},
    enabled: true,
    maxItems: 100,
    targets: ["market_pool"],
    prospectOrganizationId: null,
    ...overrides,
  };
}

function deps(overrides: Partial<ApifyRunDeps> = {}): ApifyRunDeps {
  const { repo } = createFakeRepository();
  return {
    source: source(),
    repo,
    now: "2026-03-01T08:00:00.000Z",
    runId: "run-1",
    tokenConfigured: () => true,
    claimLock: async () => true,
    releaseLock: async () => {},
    startRun: async () => ({ id: "apify-run-1", datasetId: "ds-1" }),
    waitRun: async () => ({
      status: "SUCCEEDED",
      datasetId: "ds-1",
      costUsd: 0.42,
      usage: { ACTOR_COMPUTE_UNITS: 0.01 },
      timedOut: false,
    }),
    readDataset: async () => [SAMPLE_ITEM],
    ...overrides,
  };
}

describe("maparea rezultatelor Apify", () => {
  it("produce forma noastră dintr-un element capturat", () => {
    const { listings, discarded } = mapApifyItems(SOURCE_ID, [SAMPLE_ITEM], null);
    expect(discarded).toEqual([]);
    expect(listings).toHaveLength(1);
    const listing = listings[0]!;
    expect(listing.source).toBe(SOURCE_ID);
    expect(listing.sourceListingId).toBe("ap-1001");
    expect(listing.url).toBe("https://example.ro/anunt/ap-1001");
    expect(listing.price).toBe(89500);
    expect(listing.currency).toBe("EUR");
    expect(listing.usableArea).toBe(54.5);
    expect(listing.rooms).toBe(2);
    expect(listing.city).toBe("București");
    expect(listing.features["vanzator agentie"]).toBe(true);
    expect(listing.rawData.original["listingDate"]).toBe("2026-02-14T10:00:00.000Z");
    expect(listing.imageUrl).toBe("https://example.ro/img/1.jpg");
  });

  it("respinge și numără rândurile fără preț sau fără url", () => {
    const items = [
      SAMPLE_ITEM,
      { ...SAMPLE_ITEM, id: "ap-2", price: null },
      { ...SAMPLE_ITEM, id: "ap-3", url: null },
      { ...SAMPLE_ITEM, id: "ap-4", price: 0 },
    ];
    const { listings, discarded } = mapApifyItems(SOURCE_ID, items, null);
    expect(listings).toHaveLength(1);
    expect(discarded).toHaveLength(3);
    const reasons = summarizeDiscards(discarded);
    expect(reasons).toContainEqual({ reason: "Lipsește prețul.", count: 1 });
    expect(reasons).toContainEqual({ reason: "Lipsește adresa anunțului.", count: 1 });
    expect(reasons.some((r) => r.reason.includes("pozitiv"))).toBe(true);
  });

  it("folosește maparea configurată pe sursă, fără cod nou", () => {
    const item = { ref: "x-9", href: "https://a.ro/9", suma: 1000, valuta: "EUR", supr: 40 };
    const { listings } = mapApifyItems(SOURCE_ID, [item], {
      sourceListingId: "ref",
      url: "href",
      price: "suma",
      currency: "valuta",
      usableArea: "supr",
    });
    expect(listings[0]?.price).toBe(1000);
    expect(listings[0]?.usableArea).toBe(40);
  });

  it("citește tipul vânzătorului, data și url-urile imaginilor", () => {
    expect(classifySellerType(true)).toBe("agency");
    expect(classifySellerType(false)).toBe("owner");
    expect(classifySellerType("Proprietar")).toBe("owner");
    expect(classifySellerType("altceva")).toBe("unknown");
    expect(parseListingDate("2026-01-02")).toBe("2026-01-02T00:00:00.000Z");
    expect(parseListingDate("azi")).toBeNull();
    expect(collectImageUrls([{ url: "https://a/1.jpg" }, "https://a/2.jpg", "nu"])).toEqual([
      "https://a/1.jpg",
      "https://a/2.jpg",
    ]);
  });
});

describe("rularea unei surse Apify", () => {
  it("scrie prin pipeline-ul existent, cu deduplicare și istoric de preț", async () => {
    const { repo, store } = createFakeRepository();
    const first = await runApifySourceImport(deps({ repo }));
    expect(first.status).toBe("completed");
    expect(first.received).toBe(1);
    expect(first.created).toBe(1);
    expect(first.costUsd).toBe(0.42);
    expect(store.snapshots.map((s) => s.changeType)).toEqual(["first_import"]);

    const second = await runApifySourceImport(
      deps({ repo, readDataset: async () => [{ ...SAMPLE_ITEM, price: 85000 }] }),
    );
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(store.listings).toHaveLength(1);
    expect(store.snapshots.map((s) => s.changeType)).toEqual(["first_import", "price"]);
  });

  it("refuză o sursă oprită", async () => {
    await expect(runApifySourceImport(deps({ source: source({ enabled: false }) }))).rejects.toThrow(
      APIFY_SOURCE_DISABLED,
    );
  });

  it("refuză destinația „prospecți” fără agenție destinatară", async () => {
    await expect(
      runApifySourceImport(deps({ source: source({ targets: ["prospects"] }) })),
    ).rejects.toThrow(APIFY_PROSPECT_ORG_MISSING);
  });

  it("refuză rularea fără token configurat, fără să pornească nimic", async () => {
    let started = false;
    await expect(
      runApifySourceImport(
        deps({
          tokenConfigured: () => false,
          startRun: async () => {
            started = true;
            return { id: "x", datasetId: null };
          },
        }),
      ),
    ).rejects.toThrow(APIFY_TOKEN_MISSING);
    expect(started).toBe(false);
  });

  it("refuză o rulare suprapusă a aceleiași surse", async () => {
    await expect(runApifySourceImport(deps({ claimLock: async () => false }))).rejects.toThrow(
      APIFY_RUN_IN_PROGRESS,
    );
  });

  it("eliberează blocarea și raportează eroarea când Apify eșuează", async () => {
    let released: { ok: boolean; error: string | null } | null = null;
    const outcome = await runApifySourceImport(
      deps({
        startRun: async () => {
          throw new Error("Apify a răspuns 402");
        },
        releaseLock: async (ok, error) => {
          released = { ok, error };
        },
      }),
    );
    expect(outcome.status).toBe("failed");
    expect(outcome.errors[0]?.message).toContain("402");
    expect(released).toEqual({ ok: false, error: expect.stringContaining("402") });
  });

  it("marchează depășirea timpului fără să oprească importul", async () => {
    const outcome = await runApifySourceImport(
      deps({
        waitRun: async () => ({
          status: "RUNNING",
          datasetId: "ds-1",
          costUsd: null,
          usage: null,
          timedOut: true,
        }),
      }),
    );
    expect(outcome.created).toBe(1);
    expect(outcome.errors.some((e) => e.message.includes("timpul alocat"))).toBe(true);
  });
});

describe("clientul Apify", () => {
  it("paginează datasetul și se oprește la numărul maxim de rezultate", async () => {
    const calls: { offset: number; limit: number }[] = [];
    const items = await readApifyDataset({
      datasetId: "ds",
      maxItems: 300,
      fetchPage: async (offset, limit) => {
        calls.push({ offset, limit });
        return Array.from({ length: limit }, (_, i) => ({ i: offset + i }));
      },
    });
    expect(items).toHaveLength(300);
    expect(calls).toEqual([
      { offset: 0, limit: 250 },
      { offset: 250, limit: 50 },
    ]);
  });

  it("așteaptă până la o stare terminală", async () => {
    const statuses = ["RUNNING", "RUNNING", "SUCCEEDED"];
    let index = 0;
    const result = await waitForApifyRun("r1", {
      sleep: async () => {},
      read: async () => ({
        id: "r1",
        status: statuses[index++] as never,
        datasetId: "ds",
        startedAt: null,
        finishedAt: null,
        costUsd: 1,
        usage: null,
      }),
    });
    expect(result.timedOut).toBe(false);
    expect(result.info.status).toBe("SUCCEEDED");
  });

  it("raportează depășirea bugetului de timp", async () => {
    const result = await waitForApifyRun("r1", {
      budgetMs: 0,
      sleep: async () => {},
      read: async () => ({
        id: "r1",
        status: "RUNNING",
        datasetId: null,
        startedAt: null,
        finishedAt: null,
        costUsd: null,
        usage: null,
      }),
    });
    expect(result.timedOut).toBe(true);
  });

  it("tokenul nu apare în codul livrat clientului", () => {
    const card = readFileSync("src/components/superadmin/ApifySourcesCard.tsx", "utf8");
    expect(card).not.toContain("client.server");
    expect(card).not.toContain("process.env");
    const runModule = readFileSync("src/lib/market/apify/run.ts", "utf8");
    expect(runModule).not.toContain("process.env");
  });
});

describe("costurile", () => {
  it("estimează costul din numărul maxim și prețul anunțat", () => {
    expect(estimateApifyCost(1000, 0.004)).toBe(4);
    expect(estimateApifyCost(1000, null)).toBeNull();
    expect(sumCosts([0.5, null, 1.25])).toBe(1.75);
  });
});
