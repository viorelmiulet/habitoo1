import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = { middleware: () => builder, inputValidator: () => builder, handler: (handler: unknown) => handler };
    return builder;
  },
}));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
import { getOwnerListings, privateListingsFiltersSchema } from "./listings.functions";
import { romaniaTodayStart } from "./private-listings";

type Row = {
  id: string;
  source: string;
  first_seen_at: string | null;
  is_owner: boolean;
  title?: string;
  description?: string;
  location?: string;
  property_type?: string;
  city_key?: string;
  county_key?: string;
  zone_key?: string;
  neighborhood_key?: string;
  floor_num?: number | null;
  year_built?: number | null;
  external_id?: string;
};

const cell = (row: Row, col: string) => (row as unknown as Record<string, unknown>)[col];
const cmp = (a: unknown, b: unknown): number => {
  const na = Number(a);
  const nb = Number(b);
  if (a !== null && a !== undefined && a !== "" && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a ?? "").localeCompare(String(b));
};

/** Mock PostgREST minimal: filtre eq/ilike/or generice, paginare range, citire in(), head count. */
function makeSupabase(rows: Row[]) {
  return {
    from: () => {
      let filtered = rows;
      const query = {
        select: () => query,
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => cell(r, col) === val);
          return query;
        },
        or: (filter: string) => {
          const conditions = filter
            .split(/,(?![^(]*\))/)
            .map((c) => /^([a-z_0-9]+)\.(eq|ilike|gte|lte|is|in)\.(.*)$/i.exec(c))
            .filter((m): m is RegExpExecArray => Boolean(m));
          if (conditions.length) {
            filtered = filtered.filter((r) =>
              conditions.some((m) => {
                const v = cell(r, m[1]);
                const val = m[3];
                switch (m[2].toLowerCase()) {
                  case "eq": return String(v) === val;
                  case "ilike": return String(v ?? "").toLowerCase().includes(val.replace(/%/g, "").toLowerCase());
                  case "gte": return v !== null && v !== undefined && cmp(v, val) >= 0;
                  case "lte": return v !== null && v !== undefined && cmp(v, val) <= 0;
                  case "is": return val === "null" ? v === null || v === undefined : true;
                  case "in": return val.replace(/[()]/g, "").split(",").includes(String(v));
                  default: return true;
                }
              }),
            );
          }
          return query;
        },
        ilike: (col: string, pattern: string) => {
          const needle = pattern.replace(/%/g, "").toLowerCase();
          filtered = filtered.filter((r) => String(cell(r, col) ?? "").toLowerCase().includes(needle));
          return query;
        },
        gte: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => cell(r, col) !== null && cell(r, col) !== undefined && cmp(cell(r, col), val) >= 0);
          return query;
        },
        lte: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => cell(r, col) !== null && cell(r, col) !== undefined && cmp(cell(r, col), val) <= 0);
          return query;
        },
        order: () => query,
        range: async (from: number, to: number) => ({ data: filtered.slice(from, to + 1), error: null }),
        in: async (col: string, vals: string[]) => ({
          data: filtered.filter((r) => vals.includes(cell(r, col) as string)),
          error: null,
        }),
        then: (resolve: (v: { data: null; count: number; error: null }) => void) =>
          resolve({ data: null, count: filtered.length, error: null }),
      };
      return query;
    },
  };
}

const DAY = "2026-10-24";
const at = (hour: number) => `${DAY}T${String(hour).padStart(2, "0")}:00:00Z`;

function dayRows(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 20; i += 1) rows.push({ id: `s${i}`, source: "storia", first_seen_at: at(8), is_owner: true, title: `Apartament parcare ${i}` });
  for (let i = 0; i < 20; i += 1) rows.push({ id: `r${i}`, source: "romimo", first_seen_at: at(9), is_owner: true, title: `Apartament parcare ${i}` });
  for (let i = 0; i < 10; i += 1) rows.push({ id: `o${i}`, source: "olx", first_seen_at: at(7), is_owner: true, title: `Apartament parcare ${i}` });
  return rows;
}

const handler = getOwnerListings as unknown as (input: unknown) => Promise<{ items: { id: string; source: string }[]; total: number; newToday: number }>;
const run = (rows: Row[], input: unknown) =>
  handler({ data: privateListingsFiltersSchema.parse(input), context: { supabase: makeSupabase(rows) } });

afterEach(() => { vi.clearAllMocks(); });

describe("sortarea Cele mai noi cu surse intercalate", () => {
  it("prima pagină conține anunțuri din toate sursele zilei, intercalate", async () => {
    const result = await run(dayRows(), {});
    expect(result.total).toBe(50);
    expect(result.items).toHaveLength(24);
    expect(new Set(result.items.map((r) => r.source))).toEqual(new Set(["storia", "romimo", "olx"]));
    expect(result.items.slice(0, 6).map((r) => r.id)).toEqual(["s0", "r0", "o0", "s1", "r1", "o1"]);
  });

  it("a doua pagină continuă intercalarea, fără duplicate și fără pierderi", async () => {
    const first = await run(dayRows(), { page: 0 });
    const second = await run(dayRows(), { page: 1 });
    const third = await run(dayRows(), { page: 2 });
    const all = [...first.items, ...second.items, ...third.items];
    expect(all).toHaveLength(50);
    expect(new Set(all.map((r) => r.id)).size).toBe(50);
    expect(new Set(second.items.map((r) => r.source))).toEqual(new Set(["storia", "romimo", "olx"]));
  });

  it("cu o sursă selectată apar doar anunțurile ei, în ordine cronologică", async () => {
    const result = await run(dayRows(), { source: "romimo" });
    expect(result.total).toBe(20);
    expect(result.items.every((r) => r.source === "romimo")).toBe(true);
  });

  it("căutarea după cuvinte cheie întoarce rezultate din toate sursele, amestecate", async () => {
    const result = await run(dayRows(), { q: "parcare" });
    expect(result.total).toBe(50);
    expect(new Set(result.items.map((r) => r.source))).toEqual(new Set(["storia", "romimo", "olx"]));
  });

  it("zilele mai vechi vin după zilele recente", async () => {
    const rows = [
      { id: "old", source: "storia", first_seen_at: "2026-10-20T10:00:00Z", is_owner: true },
      { id: "new-s", source: "storia", first_seen_at: at(10), is_owner: true },
      { id: "new-o", source: "olx", first_seen_at: at(11), is_owner: true },
    ];
    const result = await run(rows, {});
    expect(result.items.map((r) => r.id)).toEqual(["new-s", "new-o", "old"]);
  });
});

describe("filtrele noi din zona de căutare", () => {
  it("tabul Case/Vile arată doar case", async () => {
    const rows = [
      { id: "c1", source: "storia", first_seen_at: at(8), is_owner: true, property_type: "Casă" },
      { id: "a1", source: "storia", first_seen_at: at(9), is_owner: true, property_type: "Apartament" },
      { id: "t1", source: "olx", first_seen_at: at(10), is_owner: true, property_type: "Teren" },
    ];
    const result = await run(rows, { category: "case" });
    expect(result.total).toBe(1);
    expect(result.items.map((r) => r.id)).toEqual(["c1"]);
  });

  it("tabul Comerciale include spații comerciale, birouri și garaje", async () => {
    const rows = [
      { id: "sc", source: "storia", first_seen_at: at(8), is_owner: true, property_type: "Spațiu comercial" },
      { id: "bi", source: "olx", first_seen_at: at(9), is_owner: true, property_type: "Birou" },
      { id: "ga", source: "romimo", first_seen_at: at(10), is_owner: true, property_type: "Garaj" },
      { id: "ap", source: "storia", first_seen_at: at(11), is_owner: true, property_type: "Apartament" },
    ];
    const result = await run(rows, { category: "comerciale" });
    expect(result.items.map((r) => r.id).sort()).toEqual(["bi", "ga", "sc"]);
  });

  it("De azi arată doar anunțurile intrate azi și le numără corect", async () => {
    const todayStart = romaniaTodayStart();
    const today = new Date(todayStart.getTime() + 60 * 60 * 1000).toISOString();
    const yesterday = new Date(todayStart.getTime() - 60 * 60 * 1000).toISOString();
    const rows = [
      { id: "azi-1", source: "storia", first_seen_at: today, is_owner: true },
      { id: "azi-2", source: "olx", first_seen_at: today, is_owner: true },
      { id: "ieri", source: "romimo", first_seen_at: yesterday, is_owner: true },
    ];
    const all = await run(rows, {});
    expect(all.newToday).toBe(2);
    const result = await run(rows, { days: 0 });
    expect(result.total).toBe(2);
    expect(result.items.map((r) => r.id).sort()).toEqual(["azi-1", "azi-2"]);
  });

  it("Ultimele 2 zile include și anunțurile de ieri", async () => {
    const todayStart = romaniaTodayStart();
    const today = new Date(todayStart.getTime() + 60 * 60 * 1000).toISOString();
    const yesterday = new Date(todayStart.getTime() - 60 * 60 * 1000).toISOString();
    const lastWeek = new Date(todayStart.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const rows = [
      { id: "azi", source: "storia", first_seen_at: today, is_owner: true },
      { id: "ieri", source: "olx", first_seen_at: yesterday, is_owner: true },
      { id: "vechi", source: "romimo", first_seen_at: lastWeek, is_owner: true },
    ];
    const result = await run(rows, { days: 2 });
    expect(result.items.map((r) => r.id).sort()).toEqual(["azi", "ieri"]);
  });

  it("un link vechi cu oras/zona/sursa deschide aceleași rezultate", async () => {
    const rows = [
      { id: "potrivit", source: "storia", first_seen_at: at(8), is_owner: true, city_key: "bucuresti", neighborhood_key: "titan" },
      { id: "alt-cartier", source: "storia", first_seen_at: at(9), is_owner: true, city_key: "bucuresti", neighborhood_key: "militari" },
      { id: "alta-sursa", source: "olx", first_seen_at: at(10), is_owner: true, city_key: "bucuresti", neighborhood_key: "titan" },
    ];
    const result = await run(rows, { city: "București", zone: ["Titan"], source: "storia" });
    expect(result.total).toBe(1);
    expect(result.items.map((r) => r.id)).toEqual(["potrivit"]);
  });

  it("etajul se filtrează numeric, cu Parter = 0", async () => {
    const rows = [
      { id: "parter", source: "storia", first_seen_at: at(8), is_owner: true, floor_num: 0 },
      { id: "et3", source: "olx", first_seen_at: at(9), is_owner: true, floor_num: 3 },
      { id: "et8", source: "romimo", first_seen_at: at(10), is_owner: true, floor_num: 8 },
    ];
    const result = await run(rows, { floorMin: 0, floorMax: 4 });
    expect(result.items.map((r) => r.id).sort()).toEqual(["et3", "parter"]);
  });

  it("anul construcției include implicit anunțurile fără an, sau le exclude la cerere", async () => {
    const rows = [
      { id: "an2010", source: "storia", first_seen_at: at(8), is_owner: true, year_built: 2010 },
      { id: "an1980", source: "olx", first_seen_at: at(9), is_owner: true, year_built: 1980 },
      { id: "fara-an", source: "romimo", first_seen_at: at(10), is_owner: true, year_built: null },
    ];
    const inclusiv = await run(rows, { yearMin: 2000, yearUnknown: true });
    expect(inclusiv.items.map((r) => r.id).sort()).toEqual(["an2010", "fara-an"]);
    const exclusiv = await run(rows, { yearMin: 2000, yearUnknown: false });
    expect(exclusiv.items.map((r) => r.id)).toEqual(["an2010"]);
  });

  it("ID anunț găsește exact anunțul cerut", async () => {
    const rows = [
      { id: "1", source: "storia", first_seen_at: at(8), is_owner: true, external_id: "abc-ID123" },
      { id: "2", source: "olx", first_seen_at: at(9), is_owner: true, external_id: "altul" },
    ];
    const result = await run(rows, { externalId: "abc-ID123" });
    expect(result.total).toBe(1);
    expect(result.items.map((r) => r.id)).toEqual(["1"]);
  });
});
