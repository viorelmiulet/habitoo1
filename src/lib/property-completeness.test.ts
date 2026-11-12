import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { computeCompleteness, missingRequiredMessage, type CompletenessInput } from "./property-completeness";

const apartment: CompletenessInput = {
  propertyType: "apartment", title: "Apartament 3 camere", forSale: true, forRent: false,
  salePrice: 120000, rentPrice: null, city: "București", assignedTo: "agent-1",
  hasCover: true, imageCount: 8, usableSurface: 72, landSurface: null,
  description: "x".repeat(400), rooms: 3, energyClass: "B", hasContract: true, lat: 44.4, lng: 26.1,
};

describe("computeCompleteness", () => {
  it("apartament complet → 100%", () => {
    const r = computeCompleteness(apartment);
    expect(r.percent).toBe(100);
    expect(r.done).toBe(r.total);
    expect(r.label).toBe("Apartament · Vânzare");
  });

  it("teren → fără camere, cu suprafața terenului", () => {
    const r = computeCompleteness({ ...apartment, propertyType: "land", rooms: null, usableSurface: null, landSurface: 500 });
    expect(r.items.some((i) => i.key === "rooms")).toBe(false);
    const surface = r.required.find((i) => i.key === "surface")!;
    expect(surface.label).toContain("teren");
    expect(surface.done).toBe(true);
    expect(r.percent).toBe(100);
  });

  it("vânzare + închiriere fără prețul de închiriere → câmp obligatoriu necompletat", () => {
    const r = computeCompleteness({ ...apartment, forRent: true, rentPrice: null });
    expect(r.required.find((i) => i.key === "rent_price")?.done).toBe(false);
    expect(r.required.find((i) => i.key === "sale_price")?.done).toBe(true);
    expect(missingRequiredMessage(r)).toBe("Completează câmpurile obligatorii: Preț închiriere");
  });

  it("agent → „Agent alocat” bifat automat", () => {
    const r = computeCompleteness({ ...apartment, assignedTo: "agent-1" });
    expect(r.required.find((i) => i.key === "agent")?.done).toBe(true);
  });
});

// Verificarea de pe server: fără copertă publicarea e refuzată; ciorna se salvează normal.
const state = { images: [] as { is_primary: boolean }[], updates: [] as Record<string, unknown>[] };
function fakeClient() {
  const property = { id: "p1", status: "draft", property_type: "apartment", title: "T", for_sale: true, for_rent: false, sale_price: 1000, city: "Cluj", assigned_to: "a1", usable_surface: 50 };
  return {
    from(table: string) {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain, eq: chain,
        maybeSingle: async () => ({ data: property, error: null }),
        update: (patch: Record<string, unknown>) => { state.updates.push(patch); return { eq: async () => ({ error: null }) }; },
        then: (res: (v: unknown) => void) => res(table === "property_images" ? { data: state.images } : { count: 0, data: null }),
      });
      return q;
    },
  };
}

describe("loadPropertyCompleteness (server)", () => {
  beforeEach(() => { state.images = []; state.updates = []; });
  it("fără copertă → publicarea refuzată, ciorna rămâne salvabilă", async () => {
    const { loadPropertyCompleteness } = await import("./property-completeness.server");
    const { message } = await loadPropertyCompleteness(fakeClient() as never, "p1");
    expect(message).toBe("Completează câmpurile obligatorii: Fotografie de copertă");
    // Salvarea ca ciornă nu trece prin verificare: completarea parțială e permisă.
    state.images = [{ is_primary: true }];
    expect((await loadPropertyCompleteness(fakeClient() as never, "p1")).message).toBeNull();
  });
});

describe("schema", () => {
  it("nicio coloană nouă în baza de date", () => {
    const sql = readdirSync("supabase/migrations").filter((f) => /completeness|completare/i.test(f));
    expect(sql).toEqual([]);
    const src = readFileSync("src/lib/property-completeness.ts", "utf8");
    expect(src).not.toMatch(/ALTER TABLE|ADD COLUMN/i);
  });
});
vi.restoreAllMocks();
