import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mapImmofluxStatus, normalizeApiItem, parsePage, runImportPage, type ImportDeps, type ImportJob, type Landlord } from "../immoflux/api-import";
import { productionDeps } from "../immoflux/api-import.server";
import { mapImmofluxItem } from "../immoflux/mapper";
import { mapPropertyToFeed, type PropertyRow } from "@/lib/site-feed/mapper";

vi.mock("../immoflux/connection.server", () => ({ unlockImmofluxKey: () => TOKEN }));
const TOKEN = "tok-SECRET-9f8e";
const A = "org-a", B = "org-b";

const item = (id: number, extra: Record<string, unknown> = {}) => ({ id, ref: `IF-${id}`, category_id: 1, subcategory_id: 101, transaction_id: 1, price: 90000, price_currency: 1,
  title: "Apartament", description: "Descriere", city: "Cluj-Napoca", zone: "Centru", address: "Str. Lungă", address_nr: "3", rooms: 2, status: 1, images: [], ...extra });
const job = (org: string): ImportJob => ({ id: `j-${org}`, organization_id: org, requested_by: "sa", next_page: 1, next_index: 0, last_page: null, total: null, imported_count: 0, existing_count: 0, error_count: 0, unmapped_codes: [], report: [] });

function world(pages: Record<string, unknown[]>, opts: { agents?: Record<string, unknown>; contacts?: Record<string, { id: string; phone?: string; email?: string }[]> } = {}) {
  const created: { org: string; row: Record<string, unknown> }[] = [];
  const contacts = opts.contacts ?? { [A]: [], [B]: [] };
  const newContacts: { org: string; c: Landlord }[] = [];
  const fetched: string[] = [];
  const deps: ImportDeps = {
    isEnabled: async () => true,
    fetchPage: async (org, page, st) => { if (st !== 1) return { data: [] }; fetched.push(`${org}:${page}`); return (pages[org] ?? [])[page - 1] ?? { data: [] }; },
    fetchDetail: async () => ({}),
    fetchAgents: async (org) => opts.agents?.[org] ?? { data: [] },
    existingIds: async (org, ids) => new Set(ids.filter((i) => created.some((c) => c.org === org && c.row["external_id"] === i))),
    members: async (org) => (org === A ? [{ id: "ana", email: "ana@a.ro" }] : [{ id: "bob", email: "bob@b.ro" }]),
    fallbackAdmin: async (org) => `admin-${org}`,
    findContactByPhone: async (org, p) => (contacts[org] ?? []).find((c) => c.phone === p)?.id ?? null,
    findContactByEmail: async (org, e) => (contacts[org] ?? []).find((c) => c.email === e)?.id ?? null,
    createContact: async (j, c) => { const id = `new-${newContacts.length}`; newContacts.push({ org: j.organization_id, c }); (contacts[j.organization_id] ??= []).push({ id, phone: c.phone?.replace(/\D/g, "") ?? undefined, email: c.email ?? undefined }); return id; },
    createProperty: async (j, row) => { created.push({ org: j.organization_id, row: row as unknown as Record<string, unknown> }); return `p-${created.length}`; },
    enqueueImages: async () => {},
    save: async () => {},
  };
  return { deps, created, newContacts, contacts, fetched };
}
async function runAll(j: ImportJob, deps: ImportDeps) { for (let n = 0; n < 600; n++) { const o = await runImportPage(j, deps); if (o !== "page") return o; } throw new Error("loop"); }

describe("IMMOFLUX v2: doar GET", () => {
  it("codul IMMOFLUX nu conține nicio metodă în afară de GET", () => {
    const dir = join(__dirname, "../immoflux");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(join(dir, f), "utf8").replace(/createServerFn\(\{ method: "POST" \}\)/g, "");
      expect(src, f).not.toMatch(/method:\s*["'`](POST|PUT|PATCH|DELETE)/i);
      expect(src, f).not.toMatch(/\/api\/bridges\/portal/);
    }
  });
  it("un import complet face exclusiv cereri GET, fără token în raport", async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: String(init.method) });
      const u = new URL(url);
      if (u.pathname.endsWith("/agents")) return new Response(JSON.stringify({ data: [] }));
      if (u.pathname.startsWith("/api/v2/property/")) return new Response("x", { status: 500 });
      return new Response(JSON.stringify(u.searchParams.get("page") === "1" ? { data: [{ id: 1 }], current_page: 1, last_page: 1 } : { data: [] }));
    }) as unknown as typeof fetch;
    const q = () => q2;
    const q2: Record<string, unknown> = { select: q, update: q, insert: q, eq: q, in: q, not: q, order: q, range: async () => ({ data: [] }), limit: async () => ({ data: [] }),
      maybeSingle: async () => ({ data: { host: "agentia.immoflux.ro", slug: "api-v2", api_key_encrypted: "v1.x", enabled: true } }) };
    const admin = { from: () => q2 };
    const deps = productionDeps(admin, fetchImpl, () => false);
    const j = job(A);
    await runImportPage(j, deps);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls.every((c) => c.url.startsWith("https://agentia.immoflux.ro/api/v2/"))).toBe(true);
    expect(j.error_count).toBe(1);
    expect(JSON.stringify(j)).not.toContain(TOKEN);
  });
});

describe("IMMOFLUX v2: paginare", () => {
  it("cu metadate current_page/last_page", async () => {
    const w = world({ [A]: [{ data: [item(1)], current_page: 1, last_page: 2 }, { data: [item(2)], current_page: 2, last_page: 2 }] });
    expect(await runAll(job(A), w.deps)).toBe("done");
    expect(w.fetched).toEqual([`${A}:1`, `${A}:2`]);
  });
  it("cu next_page_url null pe ultima pagină", () => {
    expect(parsePage({ data: [item(1)], next_page_url: null }, 3).hasNext).toBe(false);
    expect(parsePage({ data: [item(1)], next_page_url: "https://x?page=4" }, 3).hasNext).toBe(true);
  });
  it("fără metadate: page incrementat până la o pagină goală", async () => {
    const w = world({ [A]: [[item(1)], [item(2)], []] });
    const j = job(A);
    expect(await runAll(j, w.deps)).toBe("done");
    expect(w.fetched).toEqual([`${A}:1`, `${A}:2`, `${A}:3`]);
    expect(j.imported_count).toBe(2);
  });
  it("oprire la pagina care repetă aceleași ID-uri", async () => {
    const w = world({ [A]: [[item(1), item(2)], [item(2), item(1)], [item(3)]] });
    const j = job(A);
    await runAll(j, w.deps);
    expect(w.fetched).toEqual([`${A}:1`, `${A}:2`]);
    expect(j.report.some((r) => r.kind === "pagination")).toBe(true);
  });
  it("limita de siguranță de 500 de pagini", async () => {
    const w = world({});
    w.deps.fetchPage = async (_org, page, st) => { if (st !== 1) return { data: [] }; w.fetched.push(String(page)); return [item(page)]; };
    const j = job(A);
    expect(await runAll(j, w.deps)).toBe("done");
    expect(w.fetched).toHaveLength(500);
  });
});

describe("IMMOFLUX v2: statusuri, agenți, proprietari, note, imagini", () => {
  it.each([[1, 1, "active"], [2, 1, "reserved"], [3, 1, "sold"], [3, 2, "rented"], [4, 1, "expired"], [5, 2, "archived"]])("status %s (tranzacție %s) → %s, importat ca ciornă", async (status, transaction, expected) => {
    expect(mapImmofluxStatus(status, transaction)).toBe(expected);
    const w = world({ [A]: [[item(1, { status, transaction_id: transaction })]] });
    await runAll(job(A), w.deps);
    expect(w.created[0]!.row).toMatchObject({ status: "draft", publish_status: "unpublished" });
    expect(Object.keys(w.created[0]!.row).some((k) => /portal/i.test(k))).toBe(false);
  });
  it("agentul se potrivește prin /agents după email, altfel administratorul cu nume în raport", async () => {
    const w = world({ [A]: [[item(1, { agent_id: 7 }), item(2, { agent_id: 8 }), item(3, { agent_id: 9 })]] }, { agents: { [A]: { data: [{ id: 7, email: "ANA@a.ro" }, { id: 8, first_name: "Ion", last_name: "Pop", email: "ion@x.ro" }, { id: 9, email: "bob@b.ro" }] } } });
    const j = job(A);
    await runAll(j, w.deps);
    expect(w.created.map((c) => c.row["assigned_to"])).toEqual(["ana", `admin-${A}`, `admin-${A}`]);
    expect(j.report.some((r) => r.kind === "agent" && r.message.includes("Ion Pop"))).toBe(true);
  });
  it("proprietarul devine contact, deduplicat după telefon apoi email; existentul nu se modifică", async () => {
    const contacts = { [A]: [{ id: "exist-phone", phone: "0722111222" }, { id: "exist-mail", email: "m@x.ro" }], [B]: [] };
    const w = world({ [A]: [[
      item(1, { landlord: { first_name: "Maria", last_name: "Ion", phones: ["+40 722 111 222"], emails: ["altul@x.ro"] } }),
      item(2, { landlord: { name: "Dan Rus", email: "M@x.ro" } }),
      item(3, { landlord: { name: "Ana Noua", phone: "0733000111" } }),
      item(4, { landlord: { name: "Ana Noua", phone: "0733 000 111" } }),
    ]] }, { contacts });
    await runAll(job(A), w.deps);
    expect(w.created.map((c) => c.row["owner_contact_id"])).toEqual(["exist-phone", "exist-mail", "new-0", "new-0"]);
    expect(w.newContacts).toHaveLength(1);
    expect(contacts[A]![0]).toEqual({ id: "exist-phone", phone: "0722111222" });
  });
  it("proprietarul nu se caută în altă agenție", async () => {
    const w = world({ [B]: [[item(1, { landlord: { name: "X Y", phone: "0722111222" } })]] }, { contacts: { [A]: [{ id: "a-only", phone: "0722111222" }], [B]: [] } });
    await runAll(job(B), w.deps);
    expect(w.created[0]!.row["owner_contact_id"]).toBe("new-0");
    expect(w.newContacts[0]!.org).toBe(B);
  });
  it("notele private intră doar în notele interne și nu ajung în feed", async () => {
    const w = world({ [A]: [[item(1, { private_notes: "NOTA-PRIV", price_notes: "NOTA-PRET", agent_opinion: "NOTA-OPINIE" })]] });
    await runAll(job(A), w.deps);
    const row = w.created[0]!.row;
    expect(row["internal_notes"]).toContain("IMMOFLUX – note private:\nNOTA-PRIV");
    expect(row["internal_notes"]).toContain("IMMOFLUX – note preț:\nNOTA-PRET");
    expect(row["internal_notes"]).toContain("IMMOFLUX – opinia agentului:\nNOTA-OPINIE");
    expect(String(row["description"])).not.toContain("NOTA");
    const feed = JSON.stringify(mapPropertyToFeed({ ...row, id: "11111111-1111-4111-8111-111111111111", tags: [], deleted_at: null } as unknown as PropertyRow, { baseUrl: "https://crm.habitoo.ro", publicSiteUrl: "https://habitoo.ro", images: [], agent: null, portalKeys: [] }));
    expect(feed).not.toMatch(/NOTA-/);
  });
  it("imaginile sunt acceptate ca URL-uri și ca obiecte url/src/path", () => {
    const item1 = normalizeApiItem(item(1, { images: ["https://cdn.x/a.jpg", { url: "https://cdn.x/b.jpg" }, { src: "https://cdn.x/c.jpg", ordering: 9 }, { path: "/uploads/d.jpg" }] }), "https://agentia.immoflux.ro/");
    const mapped = mapImmofluxItem(item1, { organizationId: A, assignedTo: null });
    expect(mapped.ok && mapped.images.map((i) => i.source_url)).toEqual(["https://cdn.x/a.jpg", "https://cdn.x/b.jpg", "https://agentia.immoflux.ro/uploads/d.jpg", "https://cdn.x/c.jpg"]);
  });
  it("izolare per agenție: același id în două agenții se importă în fiecare", async () => {
    const w = world({ [A]: [[item(5)]], [B]: [[item(5)]] });
    await Promise.all([runAll(job(A), w.deps), runAll(job(B), w.deps)]);
    expect(w.created.map((c) => [c.org, c.row["organization_id"], c.row["external_id"]])).toEqual([[A, A, "5"], [B, B, "5"]]);
  });
});
