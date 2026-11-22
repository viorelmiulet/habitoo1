import { describe, expect, it } from "vitest";
import { currencyCode, runImportPage, type ImportDeps, type ImportJob } from "../immoflux/api-import";

type Created = { org: string; row: Record<string, unknown> };
const ORG_A = "org-a", ORG_B = "org-b";

function item(id: number, extra: Record<string, unknown> = {}) {
  return { id, ref: `IF-${id}`, category_id: 1, subcategory_id: 101, transaction_id: 1, price: 100000, price_currency: 1,
    title: { ro: `Apartament ${id}` }, description: { ro: "Descriere" }, city: { name: "Cluj-Napoca" }, rooms: 2,
    images: [{ ordering: 1, src: `https://apcdn.immoflux.ro/${id}/a.jpg` }], ...extra };
}

/** Bază de date și API IMMOFLUX simulate, separate pe agenții. */
function world(pages: Record<string, Record<string, unknown>[][]>) {
  const created: Created[] = [];
  const existing: Record<string, Set<string>> = { [ORG_A]: new Set(), [ORG_B]: new Set() };
  const enabled: Record<string, boolean> = { [ORG_A]: true, [ORG_B]: true };
  const fetched: string[] = [];
  const members: Record<string, { id: string; email: string }[]> = {
    [ORG_A]: [{ id: "agent-a", email: "ana@a.ro" }], [ORG_B]: [{ id: "agent-b", email: "bob@b.ro" }],
  };
  const imagesFailFor = new Set<string>();
  const deps: ImportDeps = {
    isEnabled: async (org) => enabled[org] === true,
    fetchPage: async (org, page) => { fetched.push(`${org}:${page}`); const p = pages[org] ?? []; return { data: p[page - 1] ?? [], last_page: p.length, total: p.flat().length }; },
    fetchDetail: async () => { throw new Error("nu trebuie apelat"); },
    existingIds: async (org, ids) => new Set(ids.filter((i) => existing[org]!.has(i))),
    members: async (org) => members[org] ?? [],
    fallbackAdmin: async (org) => `admin-${org}`,
    createProperty: async (job, row) => { const r = row as unknown as Record<string, unknown>; created.push({ org: job.organization_id, row: r }); existing[job.organization_id]!.add(String(r["external_id"])); return `p-${job.organization_id}-${String(r["external_id"])}`; },
    enqueueImages: async (_job, propertyId) => { if (imagesFailFor.has(propertyId)) throw new Error("descărcare eșuată"); },
    save: async () => {},
  };
  return { deps, created, existing, enabled, fetched, members, imagesFailFor };
}

function job(org: string): ImportJob {
  return { id: `job-${org}`, organization_id: org, requested_by: "sa", next_page: 1, next_index: 0, last_page: null, total: null,
    imported_count: 0, existing_count: 0, error_count: 0, unmapped_codes: [], report: [] };
}

async function runAll(j: ImportJob, deps: ImportDeps) {
  for (let n = 0; n < 50; n++) { const o = await runImportPage(j, deps); if (o !== "page") return o; }
  throw new Error("loop");
}

describe("import IMMOFLUX din API", () => {
  it("parcurge toate paginile până la last_page", async () => {
    const w = world({ [ORG_A]: [[item(1), item(2)], [item(3)], [item(4)]] });
    const j = job(ORG_A);
    expect(await runAll(j, w.deps)).toBe("done");
    expect(w.fetched).toEqual([`${ORG_A}:1`, `${ORG_A}:2`, `${ORG_A}:3`]);
    expect(j.imported_count).toBe(4);
  });

  it("al doilea import nu modifică anunțurile deja importate", async () => {
    const w = world({ [ORG_A]: [[item(1), item(2)]] });
    await runAll(job(ORG_A), w.deps);
    const second = job(ORG_A);
    await runAll(second, w.deps);
    expect(w.created).toHaveLength(2);
    expect(second).toMatchObject({ imported_count: 0, existing_count: 2, error_count: 0 });
  });

  it("anunțurile noi sunt ciornă, nepublicate, cu sursa și referința IMMOFLUX", async () => {
    const w = world({ [ORG_A]: [[item(7)]] });
    await runAll(job(ORG_A), w.deps);
    expect(w.created[0]!.row).toMatchObject({ status: "draft", publish_status: "unpublished", source: "immoflux", external_id: "7", external_reference: "IF-7", organization_id: ORG_A });
    expect(Object.keys(w.created[0]!.row).some((k) => /portal/i.test(k))).toBe(false);
  });

  it("acceptă moneda ca număr și ca text", async () => {
    expect(currencyCode(1)).toBe(1);
    expect(currencyCode("EUR")).toBe(1);
    expect(currencyCode(" ron ")).toBe(2);
    expect(currencyCode("3")).toBe(3);
    const w = world({ [ORG_A]: [[item(1, { price_currency: "RON" }), item(2, { price_currency: 3 })]] });
    await runAll(job(ORG_A), w.deps);
    expect(w.created.map((c) => c.row["currency"])).toEqual(["RON", "USD"]);
  });

  it("dotările nemapate ajung în raport, fără valori inventate", async () => {
    const w = world({ [ORG_A]: [[item(1, { utilities: [10001, 10011] })]] });
    const j = job(ORG_A);
    await runAll(j, w.deps);
    expect(j.unmapped_codes.join(" ")).toContain("10011");
    expect(w.created[0]!.row["utilities"]).toEqual(["Curent electric"]);
  });

  it("potrivește agentul după email, altfel administratorul agenției, cu nume în raport", async () => {
    const w = world({ [ORG_A]: [[item(1, { agent_email: "ANA@a.ro" }), item(2, { agent_email: "x@y.ro", agent_name: "Ion Pop" })]] });
    const j = job(ORG_A);
    await runAll(j, w.deps);
    expect(w.created.map((c) => c.row["assigned_to"])).toEqual(["agent-a", `admin-${ORG_A}`]);
    expect(j.report.some((r) => r.kind === "agent" && r.message.includes("Ion Pop"))).toBe(true);
  });

  it("un agent din altă agenție nu este asignat niciodată", async () => {
    const w = world({ [ORG_A]: [[item(1, { agent_email: "bob@b.ro" })]] });
    await runAll(job(ORG_A), w.deps);
    expect(w.created[0]!.row["assigned_to"]).toBe(`admin-${ORG_A}`);
  });

  it("o imagine eșuată nu oprește importul", async () => {
    const w = world({ [ORG_A]: [[item(1), item(2)]] });
    w.imagesFailFor.add(`p-${ORG_A}-1`);
    const j = job(ORG_A);
    expect(await runAll(j, w.deps)).toBe("done");
    expect(j.imported_count).toBe(2);
    expect(j.report.some((r) => r.kind === "image" && r.immofluxId === "1")).toBe(true);
  });

  it("două agenții importă fiecare doar în propria agenție; același id nu se deduplică între ele", async () => {
    const w = world({ [ORG_A]: [[item(5), item(6)]], [ORG_B]: [[item(5)]] });
    const [a, b] = [job(ORG_A), job(ORG_B)];
    await Promise.all([runAll(a, w.deps), runAll(b, w.deps)]);
    expect(w.created.filter((c) => c.org === ORG_A).map((c) => c.row["external_id"])).toEqual(["5", "6"]);
    expect(w.created.filter((c) => c.org === ORG_B).map((c) => c.row["external_id"])).toEqual(["5"]);
    expect(w.created.every((c) => c.row["organization_id"] === c.org)).toBe(true);
    expect(b.imported_count).toBe(1);
  });

  it("se oprește la pagina următoare dacă importul este dezactivat", async () => {
    const w = world({ [ORG_A]: [[item(1)], [item(2)]] });
    const j = job(ORG_A);
    expect(await runImportPage(j, w.deps)).toBe("page");
    w.enabled[ORG_A] = false;
    expect(await runImportPage(j, w.deps)).toBe("stopped");
    expect(w.created).toHaveLength(1);
  });

  it("un anunț eșuat nu le afectează pe celelalte", async () => {
    const w = world({ [ORG_A]: [[item(1, { transaction_id: 9 }), item(2)]] });
    const j = job(ORG_A);
    await runAll(j, w.deps);
    expect(j).toMatchObject({ imported_count: 1, error_count: 1 });
  });
});
