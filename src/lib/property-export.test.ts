import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/portals/registry", () => ({ allPortals: () => [{ id: "storia", display_name: "Storia" }] }));
import { PROPERTY_EXPORT_HEADERS, PROPERTY_EXPORT_SELECT, buildPropertyCsv, exportFileName, exportRow, scopeExportRows, type ExportProperty } from "./property-export";
import { loadFilteredExportRows, buildExportCsv } from "./property-export.server";
import { emptyPropertyListFilters as emptyFilters } from "./property-list-filters";

const base: ExportProperty = {
  id: "p1", organization_id: "o1", assigned_to: "a1", reference: "HB-1", title: "Apartament; 2 camere „centru”", property_type: "apartment",
  transaction_kind: "sale", for_rent: false, price: 100000, currency: "EUR", sale_price: null, sale_currency: null, rent_price: null, rent_currency: null,
  rooms: 2, usable_surface: 54, floor: 3, floor_label: null, district: "Militari", city: "București", county: "București", publish_status: "published",
  development_id: null, created_at: "2026-11-01T10:00:00Z", published_at: "2026-11-02T10:00:00Z", public_slug: "apartament-2-camere-hb-1",
};

function mockDb(total: number) {
  const calls: [string, unknown[]][] = [];
  const make = (): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "lte", "is", "or", "order", "ilike", "neq"]) q[m] = (...a: unknown[]) => { calls.push([m, a]); return q; };
    q["range"] = (from: number, to: number) => { calls.push(["range", [from, to]]); const n = Math.max(0, Math.min(total, to + 1) - from); return Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ ...base, id: `p${from + i}` })), error: null }); };
    return q;
  };
  return { calls, db: { from: () => make(), rpc: () => make() } };
}

describe("export CSV proprietăți", () => {
  it("respectă filtrele active și exportă toate paginile, nu doar pagina curentă", async () => {
    const { calls, db } = mockDb(2500);
    const rows = await loadFilteredExportRows(db as never, {
      organizationId: "o1", filters: { ...emptyFilters, transaction: "rent", rooms: "2" }, placeChoices: [],
      agentClause: { kind: "agent", id: "a9" }, restrictIds: null, sortColumn: "price", sortAsc: true,
    }, "u1");
    expect(rows).toHaveLength(2500);
    expect(calls).toContainEqual(["eq", ["transaction_kind", "rent"]]);
    expect(calls).toContainEqual(["eq", ["rooms", 2]]);
    expect(calls).toContainEqual(["eq", ["assigned_to", "a9"]]);
    expect(calls).toContainEqual(["eq", ["organization_id", "o1"]]);
    expect(calls.filter(([m]) => m === "range")).toHaveLength(3);
  });
  it("lista restrânsă goală (favorite/promovare fără rezultate) nu exportă nimic", async () => {
    const { db } = mockDb(10);
    expect(await loadFilteredExportRows(db as never, { organizationId: "o1", filters: emptyFilters, placeChoices: [], agentClause: { kind: "none" }, restrictIds: [], sortColumn: "created_at", sortAsc: false }, "u1")).toEqual([]);
  });
  it("agentul nu exportă proprietățile altora; adminul exportă toată agenția", () => {
    const rows = [{ ...base, id: "a", assigned_to: "u1" }, { ...base, id: "b", assigned_to: "u2" }, { ...base, id: "c", organization_id: "o2", assigned_to: "u1" }];
    expect(scopeExportRows(rows, { orgId: "o1", userId: "u1", isAdmin: false }).map((r) => r.id)).toEqual(["a"]);
    expect(scopeExportRows(rows, { orgId: "o1", userId: "u1", isAdmin: true }).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("nu citește și nu scrie datele proprietarului sau notele interne", async () => {
    expect(PROPERTY_EXPORT_SELECT).not.toMatch(/owner|internal_notes|notes|phone|email/);
    expect(PROPERTY_EXPORT_HEADERS.join(" ")).not.toMatch(/Proprietar|Telefon|Email|Note/i);
    const leaky = { ...base, owner_name: "Ion Popescu", owner_phone: "0722000000", internal_notes: "secret" } as ExportProperty;
    const csv = buildPropertyCsv([exportRow(leaky, { agentName: () => "Ana", developmentName: () => "", portals: () => [] })]);
    expect(csv).not.toMatch(/Ion Popescu|0722000000|secret/);
  });
  it("UTF-8 cu BOM, separator ; și ghilimele corecte", () => {
    const csv = buildPropertyCsv([exportRow(base, { agentName: () => "Ana", developmentName: () => "", portals: () => ["Storia", "iMove.ro"] })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, line] = csv.slice(1).split("\r\n");
    expect(header!.split(";")).toHaveLength(PROPERTY_EXPORT_HEADERS.length);
    expect(line).toContain('"Apartament; 2 camere „centru”"');
    expect(line).toContain(";100000;EUR;;;2;54;3;Militari;București;București;Publicat;Ana;;Storia, iMove.ro;2026-11-01;2026-11-02;https://www.habitoo.ro/oferta/apartament-2-camere-hb-1");
  });
  it("prețul de chirie merge în coloana chirie", () => {
    const r = exportRow({ ...base, transaction_kind: "rent", price: 500 }, { agentName: () => "", developmentName: () => "", portals: () => [] });
    expect(r.slice(3, 8)).toEqual(["Închiriere", "", "", "500", "EUR"]);
  });
  it("nume fișier proprietati-{agentie}-{data}.csv", () => {
    expect(exportFileName("Agenția Șerban & Fiii", new Date("2026-11-21T12:00:00Z"))).toBe("proprietati-agentia-serban-fiii-2026-11-21.csv");
  });
  it("include portalurile publicate din registru", async () => {
    const table = (rows: unknown[]) => { const q: Record<string, unknown> = {}; for (const m of ["select", "in", "eq"]) q[m] = () => q; q["then"] = (r: (v: unknown) => void) => r({ data: rows }); return q; };
    const db = { from: (t: string) => table(t === "portal_publications" ? [{ property_id: "p1", portal_key: "storia" }] : t === "profiles" ? [{ id: "a1", full_name: "Ana" }] : []) };
    const csv = await buildExportCsv(db as never, [base]);
    expect(csv).toContain(";Ana;;Storia;");
  });
});
