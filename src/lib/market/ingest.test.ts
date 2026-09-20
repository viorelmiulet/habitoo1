import { describe, expect, it } from "vitest";
import { createFakeRepository } from "./__tests__/fake-repository";
import { ingestListings, summarizeHistory } from "./ingest";
import { normalizeRecord, type NormalizedListing } from "./normalize";
import { HABITOO_MAPPING } from "./sources";

function listing(source: string, overrides: Record<string, unknown>): NormalizedListing {
  const result = normalizeRecord(
    source,
    {
      id: "L-1",
      titlu: "Apartament 2 camere",
      tip: "apartament",
      tranzactie: "vanzare",
      oras: "Bucuresti",
      adresa: "Strada Aviatorilor 5",
      camere: 2,
      suprafata_utila: 60,
      etaj: 3,
      pret: 100000,
      moneda: "EUR",
      ...overrides,
    },
    HABITOO_MAPPING,
  );
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join("; "));
  return result.listing;
}

const T1 = "2026-01-01T10:00:00.000Z";
const T2 = "2026-01-11T10:00:00.000Z";
const T3 = "2026-01-21T10:00:00.000Z";

describe("importul ofertelor de piață", () => {
  it("creează oferta o singură dată, indiferent de câte ori se importă", async () => {
    const { repo, store } = createFakeRepository();
    const rows = [listing("imobiliare_ro", {})];

    const first = await ingestListings(repo, {
      source: "imobiliare_ro",
      mode: "partial",
      runId: "run-1",
      now: T1,
    }, rows);
    expect(first.created).toBe(1);
    expect(store.listings).toHaveLength(1);

    const second = await ingestListings(repo, {
      source: "imobiliare_ro",
      mode: "partial",
      runId: "run-2",
      now: T2,
    }, rows);
    expect(second.created).toBe(0);
    expect(second.unchanged).toBe(1);
    expect(store.listings).toHaveLength(1);
    // un singur snapshot: primul import, fără schimbări inventate
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0]?.changeType).toBe("first_import");
  });

  it("respinge duplicatul din același fișier fără să oprească importul", async () => {
    const { repo, store } = createFakeRepository();
    const summary = await ingestListings(
      repo,
      { source: "imobiliare_ro", mode: "partial", runId: null, now: T1 },
      [listing("imobiliare_ro", {}), listing("imobiliare_ro", {})],
    );
    expect(summary.received).toBe(2);
    expect(summary.created).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(store.listings).toHaveLength(1);
  });

  it("înregistrează schimbarea de preț ca snapshot și păstrează prețul inițial", async () => {
    const { repo, store } = createFakeRepository();
    await ingestListings(repo, { source: "imobiliare_ro", mode: "partial", runId: null, now: T1 }, [
      listing("imobiliare_ro", { pret: 100000 }),
    ]);
    const summary = await ingestListings(
      repo,
      { source: "imobiliare_ro", mode: "partial", runId: null, now: T2 },
      [listing("imobiliare_ro", { pret: 92000 })],
    );
    expect(summary.priceChanges).toBe(1);
    expect(summary.updated).toBe(1);

    const row = store.listings[0]!;
    expect(row.price).toBe(92000);
    expect(row.initialPrice).toBe(100000);
    expect(row.priceChanges).toBe(1);

    const priceSnapshot = store.snapshots.find((s) => s.changeType === "price");
    expect(priceSnapshot?.previousPrice).toBe(100000);
    expect(priceSnapshot?.price).toBe(92000);

    const insight = summarizeHistory({
      initialPrice: row.initialPrice,
      price: row.price,
      priceChanges: row.priceChanges,
      statusChanges: row.statusChanges,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      status: row.status,
    });
    expect(insight.totalDiscount).toBe(8000);
    expect(insight.discountPercent).toBe(8);
    expect(insight.daysOnMarket).toBe(10);
  });

  it("marchează dispariția din feedul complet fără să șteargă istoricul", async () => {
    const { repo, store } = createFakeRepository();
    await ingestListings(repo, { source: "imobiliare_ro", mode: "full", runId: null, now: T1 }, [
      listing("imobiliare_ro", { id: "L-1" }),
      listing("imobiliare_ro", { id: "L-2", adresa: "Strada Unirii 10" }),
    ]);
    expect(store.listings).toHaveLength(2);

    const summary = await ingestListings(
      repo,
      { source: "imobiliare_ro", mode: "full", runId: null, now: T2 },
      [listing("imobiliare_ro", { id: "L-1" })],
    );
    expect(summary.deactivated).toBe(1);

    const gone = store.listings.find((row) => row.sourceListingId === "L-2")!;
    expect(gone.status).toBe("inactive");
    expect(gone.disappearedAt).toBe(T2);
    expect(store.snapshots.some((s) => s.changeType === "disappeared")).toBe(true);
    // nicio ofertă nu este ștearsă
    expect(store.listings).toHaveLength(2);
  });

  it("înregistrează reapariția unei oferte dispărute", async () => {
    const { repo, store } = createFakeRepository();
    await ingestListings(repo, { source: "imobiliare_ro", mode: "full", runId: null, now: T1 }, [
      listing("imobiliare_ro", {}),
    ]);
    await ingestListings(repo, { source: "imobiliare_ro", mode: "full", runId: null, now: T2 }, []);
    expect(store.listings[0]?.status).toBe("inactive");

    await ingestListings(repo, { source: "imobiliare_ro", mode: "full", runId: null, now: T3 }, [
      listing("imobiliare_ro", {}),
    ]);
    const row = store.listings[0]!;
    expect(row.status).toBe("active");
    expect(row.disappearedAt).toBeNull();
    expect(store.snapshots.some((s) => s.changeType === "reappeared")).toBe(true);
  });

  it("importul parțial nu dezactivează ofertele lipsă din fișier", async () => {
    const { repo, store } = createFakeRepository();
    await ingestListings(repo, { source: "imobiliare_ro", mode: "full", runId: null, now: T1 }, [
      listing("imobiliare_ro", { id: "L-1" }),
      listing("imobiliare_ro", { id: "L-2", adresa: "Strada Unirii 10" }),
    ]);
    const summary = await ingestListings(
      repo,
      { source: "imobiliare_ro", mode: "partial", runId: null, now: T2 },
      [listing("imobiliare_ro", { id: "L-1" })],
    );
    expect(summary.deactivated).toBe(0);
    expect(store.listings.every((row) => row.status === "active")).toBe(true);
  });

  it("leagă aceeași proprietate publicată pe două surse la o singură entitate", async () => {
    const { repo, store } = createFakeRepository();
    await ingestListings(repo, { source: "imobiliare_ro", mode: "partial", runId: null, now: T1 }, [
      listing("imobiliare_ro", { id: "A-1" }),
    ]);
    const summary = await ingestListings(
      repo,
      { source: "storia", mode: "partial", runId: null, now: T1 },
      [listing("storia", { id: "S-9" })],
    );
    expect(summary.created).toBe(1);
    expect(summary.duplicates).toBe(1);
    expect(store.entities).toHaveLength(1);
    const entityIds = new Set(store.listings.map((row) => row.marketEntityId));
    expect(entityIds.size).toBe(1);
    expect(store.listings[1]?.dedupeStatus).toBe("merged");
  });
});

describe("duplicate între portaluri", () => {
  const BASE = { id: "L-9", cartier: "Militari", pret: 100000, suprafata_utila: 60, camere: 2 };

  async function importFrom(repo: Parameters<typeof ingestListings>[0], src: string, over: Record<string, unknown>) {
    return ingestListings(
      repo,
      { source: src, mode: "partial", runId: `run-${src}`, now: T1 },
      [listing(src, { ...BASE, ...over })],
    );
  }

  it("aceeași proprietate de pe două portaluri produce o singură ofertă cu două surse", async () => {
    const { repo, store } = createFakeRepository();
    await importFrom(repo, "imobiliare_ro", {});
    const second = await importFrom(repo, "storia_ro", { id: "L-9-b", pret: 100500 });

    expect(second.created).toBe(0);
    expect(second.crossPortalMerges).toBe(1);
    expect(store.listings).toHaveLength(1);
    expect(store.sources.map((s) => s.source).sort()).toEqual(["imobiliare_ro", "storia_ro"]);
  });

  it("nu unește oferte care diferă la camere sau la suprafață", async () => {
    const { repo, store } = createFakeRepository();
    await importFrom(repo, "imobiliare_ro", {});
    const rooms = await importFrom(repo, "storia_ro", { id: "L-9-c", camere: 3 });
    expect(rooms.crossPortalMerges).toBe(0);

    const area = await importFrom(repo, "olx_ro", { id: "L-9-d", suprafata_utila: 75 });
    expect(area.crossPortalMerges).toBe(0);
    expect(store.listings).toHaveLength(3);
  });

  it("o ofertă fără suprafață nu este niciodată unită", async () => {
    const { repo, store } = createFakeRepository();
    await importFrom(repo, "imobiliare_ro", {});
    const noArea = await importFrom(repo, "storia_ro", {
      id: "L-9-e",
      suprafata_utila: null,
      suprafata_construita: null,
    });
    expect(noArea.crossPortalMerges).toBe(0);
    expect(store.listings).toHaveLength(2);
  });
});
