import { describe, expect, it } from "vitest";
import { agentReport, runImportPage, runRepairPage, type ImportDeps, type ImportJob, type RepairDeps, type RepairTarget } from "../immoflux/api-import";

const ORG = "org-a";
const job = (): ImportJob => ({ id: "j", organization_id: ORG, requested_by: "sa", next_page: 1, next_index: 0, last_page: null, total: null, imported_count: 0, existing_count: 0, error_count: 0, unmapped_codes: [], report: [], created_at: "2026-11-22T15:43:57Z" });
const item = (id: number, extra: Record<string, unknown> = {}) => ({ id, ref: `IF-${id}`, category_id: 1, subcategory_id: 101, transaction_id: 1, price: 90000, price_currency: 1,
  title: "Apartament", description: "D", city: "Cluj-Napoca", rooms: 2, status: 1, images: [], landlord: null, private_notes: "", agent_id: 7, ...extra });

describe("IMMOFLUX: contoare", () => {
  it("imported_count = proprietăți create, inclusiv după o întrerupere; fiecare apare o dată", async () => {
    const created = new Map<string, string>();
    let crash = true;
    const deps: ImportDeps = {
      isEnabled: async () => true,
      fetchPage: async (_o, page, status) => (status === 1 && page === 1 ? { data: [1, 2, 3, 4].map((i) => item(i)), last_page: 1 } : { data: [] }),
      fetchDetail: async () => ({}), fetchAgents: async () => ({ data: [{ id: 7, email: "ana@x.ro" }] }),
      existingIds: async (_o, ids) => new Set(ids.filter((i) => created.has(i))),
      createdByJob: async (_j, ids) => new Map(ids.filter((i) => created.has(i)).map((i) => [i, created.get(i)!])),
      members: async () => [], fallbackAdmin: async () => "adm",
      findContactByPhone: async () => null, findContactByEmail: async () => null, createContact: async () => "c",
      createProperty: async (_j, row) => { const id = `p${created.size + 1}`; created.set(String((row as { external_id: string }).external_id), id); if (crash && created.size === 2) { crash = false; throw Object.assign(new Error("worker killed"), { fatal: true }); } return id; },
      enqueueImages: async () => {}, save: async () => {},
    };
    const j = job();
    // Simulează întreruperea: prima rulare pierde starea din memorie după a doua proprietate.
    const first = { ...j, report: [...j.report] };
    try { await runImportPage(first, { ...deps, createProperty: async (jj, row) => { const r = await deps.createProperty(jj, row); return r; } }); } catch { /* ignorat */ }
    const fresh = job();
    for (let n = 0; n < 10; n++) if ((await runImportPage(fresh, deps)) === "done") break;
    expect(created.size).toBe(4);
    expect(fresh.imported_count).toBe(4);
    expect(fresh.existing_count).toBe(0);
    const imported = fresh.report.filter((e) => e.kind === "imported").map((e) => e.immofluxId);
    expect(new Set(imported).size).toBe(4);
    expect(imported.length).toBe(4);
    expect(fresh.report.find((e) => e.kind === "imported")!.message).toContain("Activă");
  });

  it("anunțurile existente din alt import rămân „existente”", async () => {
    const deps = { isEnabled: async () => true, fetchPage: async (_o: string, p: number, s: number | null) => (s === 1 && p === 1 ? { data: [item(9)], last_page: 1 } : { data: [] }),
      fetchDetail: async () => ({}), fetchAgents: async () => ({ data: [] }), existingIds: async () => new Set(["9"]), createdByJob: async () => new Map(),
      members: async () => [], fallbackAdmin: async () => "adm", findContactByPhone: async () => null, findContactByEmail: async () => null, createContact: async () => "c",
      createProperty: async () => { throw new Error("nu"); }, enqueueImages: async () => {}, save: async () => {} } as ImportDeps;
    const j = job();
    for (let n = 0; n < 10; n++) if ((await runImportPage(j, deps)) === "done") break;
    expect([j.imported_count, j.existing_count]).toEqual([0, 1]);
  });
});

describe("IMMOFLUX: raportul agentului", () => {
  it("conține emailul și motivul", () => {
    expect(agentReport({ agentKey: "7", agentFound: false, agentName: null, email: null, matched: false })).toContain("negăsit în /agents");
    const m = agentReport({ agentKey: "7", agentFound: true, agentName: "Ana", email: "ana@x.ro", matched: false });
    expect(m).toContain("ana@x.ro"); expect(m).toContain("email negăsit printre utilizatorii");
  });
  it("fiecare anunț importat are un rând de agent cu emailul din /agents", async () => {
    const deps = { isEnabled: async () => true, fetchPage: async (_o: string, p: number, s: number | null) => (s === 1 && p === 1 ? { data: [item(1)], last_page: 1 } : { data: [] }),
      fetchDetail: async () => ({}), fetchAgents: async () => ({ data: [{ id: 7, email: "Ana@X.ro", name: "Ana" }] }), existingIds: async () => new Set<string>(),
      members: async () => [{ id: "u1", email: "alt@x.ro" }], fallbackAdmin: async () => "adm", findContactByPhone: async () => null, findContactByEmail: async () => null, createContact: async () => "c",
      createProperty: async () => "p1", enqueueImages: async () => {}, save: async () => {} } as ImportDeps;
    const j = job();
    for (let n = 0; n < 10; n++) if ((await runImportPage(j, deps)) === "done") break;
    const a = j.report.filter((e) => e.kind === "agent");
    expect(a).toHaveLength(1);
    expect(a[0]!.message).toContain("ana@x.ro");
    expect(a[0]!.message).toContain("email negăsit printre utilizatorii activi");
  });
});

describe("IMMOFLUX: completarea pozelor și proprietarilor lipsă", () => {
  function world(targets: RepairTarget[], detail: Record<string, unknown>) {
    const enq: { property: string; urls: string[] }[] = [];
    const links: [string, string][] = [];
    const contacts: { id: string; phone: string | null; email: string | null }[] = [{ id: "c-old", phone: "0722111222", email: null }];
    const deps: RepairDeps = {
      isEnabled: async () => true,
      repairTargets: async (_o, off, lim) => targets.slice(off, off + lim),
      fetchDetail: async () => ({ data: detail }),
      fetchContact: async () => ({ data: { id: 5, name: "Ion Pop", phone: "+40 733 000 111" } }),
      imageBase: async () => "https://web.immoflux.ro/",
      findContactByPhone: async (_o, p) => contacts.find((c) => c.phone === p)?.id ?? null,
      findContactByEmail: async () => null,
      createContact: async (_j, c) => { const id = `c${contacts.length}`; contacts.push({ id, phone: (c.phone ?? "").replace(/\D/g, "").replace(/^40/, "0"), email: c.email }); return id; },
      enqueueImages: async (_j, property, imgs) => { enq.push({ property, urls: imgs.map((i) => i.source_url) }); },
      linkOwner: async (_o, p, c) => { links.push([p, c]); },
      save: async () => {},
    };
    return { deps, enq, links, contacts };
  }
  const t = (id: string, o: Partial<RepairTarget> = {}): RepairTarget => ({ id, externalId: `x${id}`, ref: null, ownerContactId: null, assignedTo: "adm", hasImages: false, ...o });

  it("pune pozele în coadă și leagă proprietarul; nu dublează contacte", async () => {
    const w = world([t("p1"), t("p2"), t("p3", { hasImages: true, ownerContactId: "c-x" })], { images: ["a.jpg", { url: "https://cdn/b.jpg" }], landlord_id: 5 });
    const j = job();
    for (let n = 0; n < 5; n++) if ((await runRepairPage(j, w.deps)) === "done") break;
    expect(w.enq).toEqual([{ property: "p1", urls: ["https://web.immoflux.ro/a.jpg", "https://cdn/b.jpg"] }, { property: "p2", urls: ["https://web.immoflux.ro/a.jpg", "https://cdn/b.jpg"] }]);
    expect(w.contacts).toHaveLength(2); // unul nou, refolosit pentru p2
    expect(w.links).toEqual([["p1", "c1"], ["p2", "c1"]]);
    expect([j.imported_count, j.existing_count, j.error_count]).toEqual([2, 1, 0]);
  });

  it("refolosește contactul existent și nu atinge pozele sau proprietarul deja prezente", async () => {
    const w = world([t("p1", { hasImages: true }), t("p2", { ownerContactId: "c-own" })], { images: ["a.jpg"], landlord: { name: "Ana B", phone: "0722 111 222" } });
    const j = job();
    for (let n = 0; n < 5; n++) if ((await runRepairPage(j, w.deps)) === "done") break;
    expect(w.links).toEqual([["p1", "c-old"]]);
    expect(w.enq.map((e) => e.property)).toEqual(["p2"]);
    expect(w.contacts).toHaveLength(1);
  });
});

describe("IMMOFLUX: limita de 60 de cereri/minut", () => {
  it("un 429 nu se numără ca eroare; anunțul se reia", async () => {
    let calls = 0;
    const deps = { isEnabled: async () => true, repairTargets: async (_o: string, off: number) => [{ id: "p1", externalId: "x1", ref: null, ownerContactId: "c", assignedTo: null, hasImages: false }].slice(off),
      fetchDetail: async () => { calls += 1; if (calls === 1) throw new Error("IMMOFLUX a răspuns cu HTTP 429."); return { images: ["https://cdn/a.jpg"] }; },
      findContactByPhone: async () => null, findContactByEmail: async () => null, createContact: async () => "c", enqueueImages: async () => {}, linkOwner: async () => {}, save: async () => {} } as RepairDeps;
    const j = job();
    expect(await runRepairPage(j, deps)).toBe("page");
    expect([j.error_count, j.next_index, j.rate_limited]).toEqual([0, 0, true]);
    expect(await runRepairPage(j, deps)).toBe("done");
    expect([j.imported_count, j.error_count]).toEqual([1, 0]);
  });
});
