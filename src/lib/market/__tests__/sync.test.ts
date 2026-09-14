/**
 * Teste pentru sincronizarea surselor de piață (ACP – Faza 3, Etapa 1).
 *
 * Verificăm contractul comun al adaptoarelor prin pipeline-ul real de import
 * (`runAdapterSync` + `ingestListings`) pe un depozit fake, plus mecanismul de
 * blocare, idempotența, validarea și izolarea pe agenție.
 */
import { describe, expect, it } from "vitest";
import { createFakeRepository } from "./fake-repository";
import { NOT_CONFIGURED_MESSAGE, runAdapterSync, sourceScopeKey } from "../adapter";
import {
  createHabitooInternalAdapter,
  habitooPropertyToRecord,
  type HabitooPropertyRow,
} from "../adapters/habitoo";
import { createMarketAdapter, createNotConfiguredAdapter } from "../registry";
import { findMarketSource } from "../sources";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

function property(overrides: Partial<HabitooPropertyRow> = {}): HabitooPropertyRow {
  return {
    id: overrides.id ?? "aaaaaaaa-0000-0000-0000-000000000001",
    title: "Apartament 2 camere",
    reference: "HB-1001",
    property_type: "apartment",
    transaction_kind: "sale",
    status: "active",
    city: "Cluj-Napoca",
    county: "Cluj",
    district: "Gheorgheni",
    street: "Strada Alverna 5",
    lat: 46.77,
    lng: 23.62,
    rooms: 2,
    bathrooms: 1,
    usable_surface: 54,
    surface: 60,
    floor: 3,
    building_floors: 8,
    build_year: 2015,
    price: 120000,
    currency: "EUR",
    finish_state: "renovated",
    furnishing: "furnished",
    parking: true,
    balcony: true,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function habitooAdapter(rowsByOrg: Record<string, HabitooPropertyRow[]>) {
  return createHabitooInternalAdapter({
    countProperties: async (org) => (rowsByOrg[org] ?? []).length,
    loadProperties: async (org) => rowsByOrg[org] ?? [],
  });
}

const ctx = (organizationId: string | null, now = "2026-02-01T10:00:00.000Z") => ({
  organizationId,
  runId: null,
  now,
});

describe("Sincronizarea surselor de piață", () => {
  it("A. sincronizează cu succes sursa internă", async () => {
    const { repo, store } = createFakeRepository();
    const result = await runAdapterSync(
      habitooAdapter({ [ORG_A]: [property()] }),
      ctx(ORG_A),
      repo,
    );
    expect(result.success).toBe(true);
    expect(result.status).toBe("ok");
    expect(result.fetched).toBe(1);
    expect(result.inserted).toBe(1);
    expect(store.listings.length).toBe(1);
    expect(store.listings[0]!.source).toBe("habitoo_internal");
  });

  it("B. a doua sincronizare nu produce duplicate", async () => {
    const { repo, store } = createFakeRepository();
    const adapter = habitooAdapter({ [ORG_A]: [property()] });
    await runAdapterSync(adapter, ctx(ORG_A), repo);
    const second = await runAdapterSync(adapter, ctx(ORG_A, "2026-02-02T10:00:00.000Z"), repo);
    const third = await runAdapterSync(adapter, ctx(ORG_A, "2026-02-03T10:00:00.000Z"), repo);
    expect(store.listings.length).toBe(1);
    expect(second.inserted).toBe(0);
    expect(third.inserted).toBe(0);
  });

  it("C. actualizează o ofertă existentă când prețul se schimbă", async () => {
    const { repo, store } = createFakeRepository();
    await runAdapterSync(habitooAdapter({ [ORG_A]: [property()] }), ctx(ORG_A), repo);
    const result = await runAdapterSync(
      habitooAdapter({ [ORG_A]: [property({ price: 115000 })] }),
      ctx(ORG_A, "2026-02-05T10:00:00.000Z"),
      repo,
    );
    expect(result.updated).toBe(1);
    expect(store.listings.length).toBe(1);
    expect(store.listings[0]!.price).toBe(115000);
    expect(store.snapshots.some((s) => s.reason === "price")).toBe(true);
  });

  it("D. respinge ofertele fără date minime, fără să inventeze valori", async () => {
    const { repo, store } = createFakeRepository();
    const result = await runAdapterSync(
      habitooAdapter({
        [ORG_A]: [
          property({ id: "aaaaaaaa-0000-0000-0000-000000000002", price: null }),
          property({ id: "aaaaaaaa-0000-0000-0000-000000000003", usable_surface: null, surface: null }),
        ],
      }),
      ctx(ORG_A),
      repo,
    );
    expect(result.rejected).toBe(2);
    expect(result.inserted).toBe(0);
    expect(store.listings.length).toBe(0);
    expect(result.errors.length).toBe(2);
  });

  it("E. o sursă neconfigurată nu simulează o sincronizare reușită", async () => {
    const { repo, store } = createFakeRepository();
    const definition = findMarketSource("imobiliare_ro")!;
    const result = await runAdapterSync(
      createNotConfiguredAdapter(definition),
      ctx(null),
      repo,
    );
    expect(result.status).toBe("not_configured");
    expect(result.success).toBe(false);
    expect(result.errors[0]!.message).toBe(NOT_CONFIGURED_MESSAGE);
    expect(store.listings.length).toBe(0);
  });

  it("F. o eroare a sursei produce status de eroare, nu date parțiale", async () => {
    const { repo, store } = createFakeRepository();
    const broken = createHabitooInternalAdapter({
      countProperties: async () => 0,
      loadProperties: async () => {
        throw new Error("feed indisponibil");
      },
    });
    const result = await runAdapterSync(broken, ctx(ORG_A), repo);
    expect(result.status).toBe("error");
    expect(result.success).toBe(false);
    expect(store.listings.length).toBe(0);
  });

  it("J. agențiile rămân izolate: fiecare își sincronizează propriile oferte", async () => {
    const { repo, store } = createFakeRepository();
    const rows = {
      [ORG_A]: [property({ id: "aaaaaaaa-0000-0000-0000-00000000000a" })],
      [ORG_B]: [property({ id: "bbbbbbbb-0000-0000-0000-00000000000b", city: "Brașov" })],
    };
    await runAdapterSync(habitooAdapter(rows), ctx(ORG_A), repo);
    await runAdapterSync(habitooAdapter(rows), ctx(ORG_B), repo);
    expect(store.listings.length).toBe(2);
    // Sincronizarea agenției B nu dezactivează ofertele agenției A (mod parțial).
    expect(store.listings.every((l) => l.status === "active")).toBe(true);
  });

  it("K. numărul de înregistrări raportat vine din sursă, nu hardcodat", async () => {
    const adapter = habitooAdapter({ [ORG_A]: [property(), property({ id: "x-2" })] });
    const test = await adapter.testConnection(ctx(ORG_A));
    expect(test.ok).toBe(true);
    expect(test.message).toContain("2");
  });

  it("M. sursele rămân independente: fiecare are propriul id de sursă", async () => {
    const { repo, store } = createFakeRepository();
    await runAdapterSync(habitooAdapter({ [ORG_A]: [property()] }), ctx(ORG_A), repo);
    await runAdapterSync(
      createNotConfiguredAdapter(findMarketSource("olx")!),
      ctx(null),
      repo,
    );
    expect(store.listings.map((l) => l.source)).toEqual(["habitoo_internal"]);
  });

  it("registry-ul întoarce adaptor intern doar pentru sursa Habitoo", () => {
    const deps = {
      habitoo: {
        countProperties: async () => 0,
        loadProperties: async () => [] as HabitooPropertyRow[],
      },
    };
    expect(createMarketAdapter("habitoo_internal", deps)?.getSourceInfo().configured).toBe(true);
    expect(createMarketAdapter("storia", deps)?.getSourceInfo().configured).toBe(false);
    expect(createMarketAdapter("inexistent", deps)).toBeNull();
  });

  it("nu expune date private ale agenției în pool", () => {
    const record = habitooPropertyToRecord(property());
    for (const key of Object.keys(record)) {
      expect(key).not.toMatch(/owner|contact|commission|note/i);
    }
  });
});

describe("Blocarea sincronizării (lock server-side)", () => {
  /** Simulăm exact contractul funcțiilor SQL market_sync_claim/market_sync_release. */
  function createLockStore(staleSeconds = 900) {
    const running = new Map<string, number>();
    const released: { key: string; ok: boolean; error: string | null }[] = [];
    return {
      released,
      claim(key: string, atMs: number) {
        const since = running.get(key);
        if (since !== undefined && atMs - since < staleSeconds * 1000) return false;
        running.set(key, atMs);
        return true;
      },
      release(key: string, ok: boolean, error: string | null) {
        running.delete(key);
        released.push({ key, ok, error });
      },
      isRunning(key: string) {
        return running.has(key);
      },
    };
  }

  it("G. a doua sincronizare simultană pe aceeași sursă este refuzată", () => {
    const locks = createLockStore();
    const key = sourceScopeKey("habitoo_internal", ORG_A);
    expect(locks.claim(key, 0)).toBe(true);
    expect(locks.claim(key, 1000)).toBe(false);
  });

  it("H. lock-ul se eliberează după succes", () => {
    const locks = createLockStore();
    const key = sourceScopeKey("habitoo_internal", ORG_A);
    locks.claim(key, 0);
    locks.release(key, true, null);
    expect(locks.isRunning(key)).toBe(false);
    expect(locks.claim(key, 10)).toBe(true);
  });

  it("I. lock-ul se eliberează și după eroare", () => {
    const locks = createLockStore();
    const key = sourceScopeKey("habitoo_internal", ORG_A);
    locks.claim(key, 0);
    locks.release(key, false, "feed indisponibil");
    expect(locks.isRunning(key)).toBe(false);
    expect(locks.released[0]!.ok).toBe(false);
  });

  it("un lock abandonat nu blochează sursa permanent", () => {
    const locks = createLockStore(900);
    const key = sourceScopeKey("habitoo_internal", ORG_A);
    expect(locks.claim(key, 0)).toBe(true);
    expect(locks.claim(key, 901_000)).toBe(true);
  });

  it("două agenții pot sincroniza aceeași sursă în același timp", () => {
    const locks = createLockStore();
    expect(locks.claim(sourceScopeKey("habitoo_internal", ORG_A), 0)).toBe(true);
    expect(locks.claim(sourceScopeKey("habitoo_internal", ORG_B), 0)).toBe(true);
  });

  it("sursele de pool comun folosesc o cheie globală", () => {
    expect(sourceScopeKey("imobiliare_ro", null)).toBe("imobiliare_ro");
    expect(sourceScopeKey("habitoo_internal", ORG_A)).toBe(`habitoo_internal:${ORG_A}`);
  });
});
