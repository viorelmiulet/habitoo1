import { describe, expect, it, vi } from "vitest";
import { runImportPage, type ImportDeps, type ImportJob } from "../immoflux/api-import";
import { productionDeps } from "../immoflux/api-import.server";

const TOKEN = "tok-SECRET-9f8e";
vi.mock("../immoflux/connection.server", () => ({ unlockImmofluxKey: () => TOKEN }));
const ORG = "org-a";
const item = (id: number) => ({ id, ref: `IF-${id}`, category_id: 1, subcategory_id: 101, transaction_id: 1, price: 90000, price_currency: 1,
  title: "Apartament", description: "D", city: "Cluj-Napoca", rooms: 2, status: 1, images: [] });
const job = (): ImportJob => ({ id: "j", organization_id: ORG, requested_by: "sa", next_page: 1, next_index: 0, last_page: null, total: null, imported_count: 0, existing_count: 0, error_count: 0, unmapped_codes: [], report: [] });

function prodWorld(respond: (u: URL) => Response) {
  const calls: URL[] = [];
  const fetchImpl = (async (url: string) => { const u = new URL(url); calls.push(u); return respond(u); }) as unknown as typeof fetch;
  const q = () => q2;
  const q2: Record<string, unknown> = { select: q, update: q, insert: q, delete: q, eq: q, in: q, not: q, ilike: q, order: q, range: async () => ({ data: [] }), limit: async () => ({ data: [] }),
    single: async () => ({ data: { id: "p1" } }), then: (r: (v: unknown) => void) => r({ data: [], error: null }),
    maybeSingle: async () => ({ data: { host: "web.immoflux.ro", slug: "api-v2", api_key_encrypted: "v1.x", enabled: true } }) };
  const admin = { from: () => q2, rpc: async () => ({ data: "HB-1", error: null }) };
  return { calls, deps: productionDeps(admin, fetchImpl, () => false) };
}
async function runAll(j: ImportJob, deps: ImportDeps) { for (let n = 0; n < 100; n++) { const o = await runImportPage(j, deps); if (o !== "page") return o; } throw new Error("loop"); }
const listCalls = (calls: URL[]) => calls.filter((u) => u.pathname === "/api/v2/properties");

describe("IMMOFLUX: citire pe status", () => {
  it("trimite filter_status__eq pentru fiecare status, niciodată __in; /agents fără parametri", async () => {
    const w = prodWorld((u) => new Response(JSON.stringify({ data: [] })));
    expect(await runAll(job(), w.deps)).toBe("done");
    const list = listCalls(w.calls);
    expect(list.map((u) => u.searchParams.get("filter_status__eq"))).toEqual(["1", "2", "3", "4", "5"]);
    expect(w.calls.every((u) => ![...u.searchParams.keys()].some((k) => k.includes("__in")))).toBe(true);
  });

  it("un 500 la un status nu oprește celelalte; raportul notează status N: HTTP 500", async () => {
    const seen: (number | null)[] = [];
    const j = job();
    const deps: Partial<ImportDeps> = {
      isEnabled: async () => true,
      fetchPage: async (_o, page, st) => { seen.push(st); if (st === 2) throw new Error("IMMOFLUX a răspuns cu HTTP 500."); return st === 3 && page === 1 ? { data: [item(7)], last_page: 1 } : { data: [] }; },
      fetchDetail: async () => ({}), fetchAgents: async () => ({ data: [] }), existingIds: async () => new Set(), members: async () => [], fallbackAdmin: async () => "adm",
      findContactByPhone: async () => null, findContactByEmail: async () => null, createContact: async () => "c", createProperty: async () => "p", enqueueImages: async () => {}, save: async () => {},
    };
    expect(await runAll(j, deps as ImportDeps)).toBe("done");
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(j.imported_count).toBe(1);
    expect(j.report.some((r) => r.message.startsWith("status 2: HTTP 500"))).toBe(true);
    expect(seen).not.toContain(null);
  });

  it("dacă toate cele 5 statusuri eșuează, rulează o dată fără filtru și notează în raport", async () => {
    const w = prodWorld((u) => u.searchParams.has("filter_status__eq") ? new Response("Server Error", { status: 500 }) : new Response(JSON.stringify({ data: [] })));
    const j = job();
    expect(await runAll(j, w.deps)).toBe("done");
    const list = listCalls(w.calls);
    expect(list).toHaveLength(6);
    expect(list[5]!.searchParams.has("filter_status__eq")).toBe(false);
    expect(j.report.some((r) => r.message.includes("doar ce întoarce IMMOFLUX implicit"))).toBe(true);
    expect(j.status_failures).toBe(5);
  });

  it("textul erorii IMMOFLUX e salvat (max 300 caractere) cu tokenul mascat", async () => {
    const body = `{"message":"SQLSTATE error for token=${TOKEN} and ${TOKEN}"}` + "x".repeat(600);
    const w = prodWorld((u) => u.searchParams.get("filter_status__eq") === "1" ? new Response(body, { status: 500 }) : new Response(JSON.stringify({ data: [] })));
    const j = job();
    await runAll(j, w.deps);
    const entry = j.report.find((r) => r.message.startsWith("status 1: HTTP 500"))!;
    expect(entry.message).toContain("SQLSTATE error");
    expect(entry.message).toContain("***");
    expect(JSON.stringify(j)).not.toContain(TOKEN);
    const detail = entry.message.split("Răspuns IMMOFLUX: ")[1]!;
    expect(detail.length).toBeLessThanOrEqual(300);
  });
});
