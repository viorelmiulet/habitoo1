import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = { middleware: () => builder, inputValidator: () => builder, handler: (handler: unknown) => handler };
    return builder;
  },
}));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
import { getOwnerListings, privateListingsFiltersSchema } from "./listings.functions";

type Row = {
  id: string;
  source: string;
  first_seen_at: string | null;
  is_owner: boolean;
  title?: string;
  description?: string;
  location?: string;
};

/** Mock PostgREST minimal: filtre eq/ilike/or, paginare range, citire in(). */
function makeSupabase(rows: Row[]) {
  return {
    from: () => {
      let filtered = rows;
      const query = {
        select: () => query,
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => (r as unknown as Record<string, unknown>)[col] === val);
          return query;
        },
        or: (filter: string) => {
          const terms = [...filter.matchAll(/ilike\.%([^%]+)%/g)].map((m) => m[1].toLowerCase());
          if (terms.length) {
            filtered = filtered.filter((r) =>
              terms.every((term) =>
                [r.title, r.description, r.location].some((field) => (field ?? "").toLowerCase().includes(term)),
              ),
            );
          }
          return query;
        },
        ilike: (col: string, pattern: string) => {
          const needle = pattern.replace(/%/g, "").toLowerCase();
          filtered = filtered.filter((r) =>
            String((r as unknown as Record<string, unknown>)[col] ?? "").toLowerCase().includes(needle),
          );
          return query;
        },
        gte: (col: string, val: number) => {
          filtered = filtered.filter((r) => Number((r as unknown as Record<string, unknown>)[col]) >= val);
          return query;
        },
        lte: (col: string, val: number) => {
          filtered = filtered.filter((r) => Number((r as unknown as Record<string, unknown>)[col]) <= val);
          return query;
        },
        order: () => query,
        range: async (from: number, to: number) => ({ data: filtered.slice(from, to + 1), error: null }),
        in: async (col: string, vals: string[]) => ({
          data: filtered.filter((r) => vals.includes((r as unknown as Record<string, unknown>)[col] as string)),
          error: null,
        }),
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

const handler = getOwnerListings as unknown as (input: unknown) => Promise<{ items: { id: string; source: string }[]; total: number }>;
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
