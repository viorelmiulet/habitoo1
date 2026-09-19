/**
 * Codul poștal dedus din adresă: comportament, nu potrivire de text.
 * Furnizorul și baza de date sunt înlocuite cu porturi false.
 */
import { describe, expect, it } from "vitest";
import {
  coordCacheKey,
  decidePostalResolution,
  pickPostalCode,
  postalCodeHint,
  resolutionKey,
  type PostalCodeRow,
} from "../postal-code";
import { resolvePostalCodeFor, type PostalPorts, type ReverseLookup } from "../postal-code.server";

function row(overrides: Partial<PostalCodeRow> = {}): PostalCodeRow {
  return {
    postal_code: null,
    postal_code_source: null,
    postal_code_resolved_from: null,
    address: "Strada Zorilor 10",
    district: null,
    city: "Chiajna",
    county: "Ilfov",
    lat: 44.447245,
    lng: 25.986806,
    locality_siruta_code: 101234,
    uat_siruta_code: 101200,
    ...overrides,
  };
}

type Recorder = {
  ports: PostalPorts;
  reverseCalls: number;
  saved: { postalCode: string; source: string; resolvedFrom: string }[];
  attempts: { outcome: string; usedProvider: boolean; source: string | null }[];
  cache: Map<string, { postalCode: string | null; source: string }>;
};

function makePorts(options: {
  reverse?: ReverseLookup;
  locality?: string | null;
  cache?: Map<string, { postalCode: string | null; source: string }>;
  callsToday?: number;
}): Recorder {
  const cache = options.cache ?? new Map<string, { postalCode: string | null; source: string }>();
  const rec: Recorder = {
    reverseCalls: 0,
    saved: [],
    attempts: [],
    cache,
    ports: {
      reverse: async () => {
        rec.reverseCalls += 1;
        return options.reverse ?? { street: null, locality: null };
      },
      localityPostal: async () => options.locality ?? null,
      cacheGet: async (key) => cache.get(key) ?? null,
      cacheSet: async (key, postalCode, source) => {
        cache.set(key, { postalCode, source });
      },
      providerCallsToday: async () => options.callsToday ?? 0,
      logAttempt: async (entry) =>
        void rec.attempts.push({
          outcome: entry.outcome,
          usedProvider: entry.usedProvider,
          source: entry.source,
        }),
      save: async (value) => void rec.saved.push(value),
    },
  };
  return rec;
}

describe("reguli pure", () => {
  it("nu atinge un cod introdus manual", () => {
    const decision = decidePostalResolution(
      row({ postal_code: "077040", postal_code_source: "manual" }),
    );
    expect(decision).toEqual({ resolve: false, reason: "manual" });
  });

  it("nu repetă rezolvarea dacă locația nu s-a schimbat", () => {
    const base = row({ postal_code: "077040", postal_code_source: "approximate" });
    const decision = decidePostalResolution({
      ...base,
      postal_code_resolved_from: resolutionKey(base),
    });
    expect(decision.resolve).toBe(false);
  });

  it("re-rezolvă o valoare dedusă când adresa s-a schimbat semnificativ", () => {
    const before = row({ postal_code: "077040", postal_code_source: "geocoded" });
    const key = resolutionKey(before);
    const after = { ...before, address: "Bulevardul Unirii 5", postal_code_resolved_from: key };
    expect(decidePostalResolution(after)).toEqual({
      resolve: true,
      reason: "location_changed",
    });
  });

  it("acceptă doar coduri poștale de șase cifre", () => {
    expect(pickPostalCode({ street: "12", locality: "077040" })).toEqual({
      postalCode: "077040",
      source: "approximate",
    });
  });

  it("afișează nota doar pentru valorile aproximative", () => {
    expect(postalCodeHint("approximate")).toContain("aproximativ");
    expect(postalCodeHint("geocoded")).toBeNull();
    expect(postalCodeHint("manual")).toBeNull();
  });
});

describe("rezolvarea propriu-zisă", () => {
  it("salvează rezultatul de stradă ca „geocoded”", async () => {
    const rec = makePorts({ reverse: { street: "077041", locality: null }, locality: "077040" });
    const result = await resolvePostalCodeFor("p1", row(), rec.ports);
    expect(result).toMatchObject({ status: "resolved", postalCode: "077041", source: "geocoded" });
    expect(rec.saved[0]).toMatchObject({ postalCode: "077041", source: "geocoded" });
  });

  it("cade pe codul localității ca „approximate”", async () => {
    const rec = makePorts({ reverse: { street: null, locality: null }, locality: "077040" });
    const result = await resolvePostalCodeFor("p1", row(), rec.ports);
    expect(result).toMatchObject({ status: "resolved", source: "approximate" });
  });

  it("lasă câmpul gol și consemnează încercarea dacă nu găsește nimic", async () => {
    const rec = makePorts({ reverse: { street: null, locality: null }, locality: null });
    const result = await resolvePostalCodeFor("p1", row(), rec.ports);
    expect(result).toMatchObject({ status: "not_found", postalCode: null });
    expect(rec.saved).toHaveLength(0);
    expect(rec.attempts[0]).toMatchObject({ outcome: "not_found" });
  });

  it("nu suprascrie niciodată o valoare manuală", async () => {
    const rec = makePorts({ reverse: { street: "077041", locality: null } });
    const result = await resolvePostalCodeFor(
      "p1",
      row({ postal_code: "999999", postal_code_source: "manual" }),
      rec.ports,
    );
    expect(result.status).toBe("skipped");
    expect(rec.reverseCalls).toBe(0);
    expect(rec.saved).toHaveLength(0);
  });

  it("folosește cache-ul pe coordonate rotunjite, fără al doilea apel", async () => {
    const cache = new Map<string, { postalCode: string | null; source: string }>();
    const first = makePorts({ reverse: { street: "077041", locality: null }, cache });
    await resolvePostalCodeFor("p1", row(), first.ports);
    expect(first.reverseCalls).toBe(1);

    const second = makePorts({ reverse: { street: "077041", locality: null }, cache });
    // Aceeași clădire, pin mutat cu câțiva metri: aceeași cheie de cache.
    const result = await resolvePostalCodeFor(
      "p2",
      row({ lat: 44.4472451, lng: 25.9868062 }),
      second.ports,
    );
    expect(second.reverseCalls).toBe(0);
    expect(result).toMatchObject({ postalCode: "077041", usedProvider: false });
    expect(cache.size).toBe(1);
    expect([...cache.keys()][0]).toBe(coordCacheKey(44.447245, 25.986806));
  });

  it("respectă plafonul zilnic per agenție", async () => {
    const rec = makePorts({
      reverse: { street: "077041", locality: null },
      locality: null,
      callsToday: 200,
    });
    const result = await resolvePostalCodeFor("p1", row(), rec.ports);
    expect(rec.reverseCalls).toBe(0);
    expect(result.status).toBe("capped");
  });
});

describe("consemnarea încercărilor", () => {
  it("consemnează și rularea fără efect (cod manual)", async () => {
    const rec = makePorts({ reverse: { street: "077041", locality: null } });
    const result = await resolvePostalCodeFor(
      "p1",
      row({ postal_code: "077040", postal_code_source: "manual" }),
      rec.ports,
    );
    expect(result.status).toBe("skipped");
    expect(rec.attempts).toHaveLength(1);
    expect(rec.attempts[0]).toMatchObject({ outcome: "skipped" });
  });

  it("consemnează rularea reușită a unei oferte fără cod poștal", async () => {
    const rec = makePorts({ reverse: { street: null, locality: null }, locality: "077040" });
    const result = await resolvePostalCodeFor("p1", row(), rec.ports);
    expect(result.status).toBe("resolved");
    expect(rec.attempts[0]).toMatchObject({ outcome: "resolved", source: "approximate" });
  });

  it("un eșec al furnizorului iese la suprafață, nu este înghițit", async () => {
    const rec = makePorts({ reverse: { street: null, locality: null }, locality: "077040" });
    const ports: PostalPorts = {
      ...rec.ports,
      save: async () => {
        throw new Error("permission denied for table properties");
      },
    };
    await expect(resolvePostalCodeFor("p1", row(), ports)).rejects.toThrow("permission denied");
  });
});
