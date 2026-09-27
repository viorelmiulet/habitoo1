/**
 * Codul poștal se calculează mereu din punctul exact de pe hartă; opțiunea
 * „locație aproximativă” schimbă doar afișarea publică.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { decidePostalResolution, resolutionKey, type PostalCodeRow } from "../postal-code";
import { resolvePostalCodeFor, type PostalPorts } from "../postal-code.server";
import { PROPERTY_COLUMNS } from "../postal-code.ports.server";
import { publicCoords } from "@/lib/geo/public-coords";

const EXACT = { lat: 44.447245, lng: 25.986806 };

function row(overrides: Partial<PostalCodeRow> = {}): PostalCodeRow {
  return {
    postal_code: null,
    postal_code_source: null,
    postal_code_resolved_from: null,
    address: "Strada Zorilor 10",
    district: null,
    city: "Chiajna",
    county: "Ilfov",
    ...EXACT,
    locality_siruta_code: null,
    uat_siruta_code: null,
    ...overrides,
  };
}

function ports(code = "077041") {
  const calls: { lat: number; lng: number }[] = [];
  const saved: string[] = [];
  const p: PostalPorts = {
    reverse: async (lat, lng) => {
      calls.push({ lat, lng });
      return { street: code, locality: null };
    },
    localityPostal: async () => null,
    cacheGet: async () => null,
    cacheSet: async () => {},
    providerCallsToday: async () => 0,
    logAttempt: async () => {},
    save: async (v) => void saved.push(v.postalCode),
  };
  return { p, calls, saved };
}

describe("cod poștal din punctul exact", () => {
  it("citește coordonatele brute, nu opțiunea de afișare", () => {
    const cols = PROPERTY_COLUMNS.split(",").map((c) => c.trim());
    expect(cols).toContain("lat");
    expect(cols).toContain("lng");
    expect(cols).not.toContain("location_precise");
  });

  it("anunț cu locație aproximativă → codul e calculat din punctul exact", async () => {
    const shown = publicCoords({ id: "p1", lat: EXACT.lat, lng: EXACT.lng, location_precise: false });
    expect(shown).not.toEqual(EXACT); // harta publică e deplasată
    const { p, calls } = ports();
    const r = await resolvePostalCodeFor("p1", row(), p);
    expect(calls).toEqual([EXACT]);
    expect(r).toMatchObject({ status: "resolved", postalCode: "077041", source: "geocoded" });
  });

  it("trecerea din „exact” în „aproximativ” nu recalculează codul", async () => {
    const resolved = row({ postal_code: "077041", postal_code_source: "geocoded" });
    resolved.postal_code_resolved_from = resolutionKey(resolved);
    // Afișarea nu face parte din rând: același rând ⇒ aceeași amprentă.
    expect(decidePostalResolution(resolved)).toEqual({ resolve: false, reason: "unchanged" });
    const { p, calls, saved } = ports("999999");
    const r = await resolvePostalCodeFor("p1", resolved, p);
    expect(r.postalCode).toBe("077041");
    expect(calls).toHaveLength(0);
    expect(saved).toHaveLength(0);
  });

  it("mutarea punctului → cod recalculat", async () => {
    const before = row({ postal_code: "077041", postal_code_source: "geocoded" });
    before.postal_code_resolved_from = resolutionKey(before);
    const moved = { ...before, lat: 44.4601, lng: 26.0102 };
    const { p, calls, saved } = ports("060042");
    const r = await resolvePostalCodeFor("p1", moved, p);
    expect(calls).toEqual([{ lat: 44.4601, lng: 26.0102 }]);
    expect(saved).toEqual(["060042"]);
    expect(r.reason).toBe("location_changed");
  });

  it("cod manual → neatins, chiar dacă punctul se mută", async () => {
    const manual = row({ postal_code: "123456", postal_code_source: "manual", lat: 44.5, lng: 26.1 });
    const { p, calls, saved } = ports();
    const r = await resolvePostalCodeFor("p1", manual, p);
    expect(r).toMatchObject({ status: "skipped", postalCode: "123456", reason: "manual" });
    expect(calls).toHaveLength(0);
    expect(saved).toHaveLength(0);
  });
});
