/**
 * Grupa 2 — scrieri parțiale și rulări blocate (comportamental, client mockat):
 *  - fiecare nume de tool folosit din server functions există în registru;
 *  - o rulare rămasă „running” peste durata rezervării poate fi reluată;
 *  - importul eșuat nu lasă contact orfan (totul într-o funcție de bază de date);
 *  - `create_task` raportează eșec parțial când follow-up-ul leadului nu se salvează;
 *  - aplicarea textului de marketing salvează textul anterior ca versiune.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RUN_CLAIM_LEASE_MS, claimSuspendedRun } from "../security/approval";

type Row = Record<string, unknown>;

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROPERTY = "33333333-3333-4333-8333-333333333333";
const DRAFT = "44444444-4444-4444-8444-444444444444";
const LEAD = "77777777-7777-4777-8777-777777777777";
const PROSPECT = "55555555-5555-4555-8555-555555555555";
const RUN = "66666666-6666-4666-8666-666666666666";

const tables: Record<string, Row[]> = {};
/** Tabele pe care scrierea trebuie să eșueze, pentru a testa eșecul parțial. */
const failWrites = new Set<string>();
/** Răspunsul funcției de bază de date pentru importul prospectului. */
let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };

function matches(row: Row, filters: [string, string, unknown][]): boolean {
  return filters.every(([op, column, value]) => {
    const current = row[column];
    if (op === "eq") return current === value;
    if (op === "is") return current === null || current === undefined;
    if (op === "gte") return String(current ?? "") >= String(value);
    if (op === "lte") return String(current ?? "") <= String(value);
    if (op === "lt") return String(current ?? "") < String(value);
    return true;
  });
}

function builder(table: string) {
  const filters: [string, string, unknown][] = [];
  let mode: "select" | "update" | "insert" = "select";
  let values: Row = {};
  let descending = false;
  let orderColumn: string | null = null;

  const fail = () => failWrites.has(table);

  const api: Record<string, unknown> = {
    select() {
      return api;
    },
    update(next: Row) {
      mode = "update";
      values = next;
      return api;
    },
    insert(next: Row) {
      mode = "insert";
      values = next;
      if (!fail()) {
        tables[table] = tables[table] ?? [];
        tables[table]!.push({ id: `${table}-${(tables[table]!.length + 1).toString()}`, ...next });
      }
      return api;
    },
    eq(column: string, value: unknown) {
      filters.push(["eq", column, value]);
      return api;
    },
    is(column: string, value: unknown) {
      filters.push(["is", column, value]);
      return api;
    },
    gte(column: string, value: unknown) {
      filters.push(["gte", column, value]);
      return api;
    },
    lte(column: string, value: unknown) {
      filters.push(["lte", column, value]);
      return api;
    },
    lt(column: string, value: unknown) {
      filters.push(["lt", column, value]);
      return api;
    },
    or() {
      return api;
    },
    ilike() {
      return api;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orderColumn = column;
      descending = options?.ascending === false;
      return api;
    },
    limit() {
      return api;
    },
    run() {
      const rows = tables[table] ?? [];
      if (mode === "update") {
        if (fail()) return [];
        const hit = rows.filter((row) => matches(row, filters));
        for (const row of hit) Object.assign(row, values);
        return hit;
      }
      if (mode === "insert") return fail() ? [] : [{ ...values }];
      const found = rows.filter((row) => matches(row, filters));
      if (orderColumn) {
        found.sort((a, b) => {
          const left = String(a[orderColumn!] ?? "");
          const right = String(b[orderColumn!] ?? "");
          return descending ? right.localeCompare(left) : left.localeCompare(right);
        });
      }
      return found;
    },
    maybeSingle() {
      const rows = (api["run"] as () => Row[])();
      const error = (mode === "update" || mode === "insert") && fail() ? { message: "write failed" } : null;
      return Promise.resolve({ data: rows[0] ? { ...rows[0] } : null, error });
    },
    single() {
      const rows = (api["run"] as () => Row[])();
      if (fail()) return Promise.resolve({ data: null, error: { message: "write failed" } });
      return Promise.resolve({
        data: rows[0] ? { ...rows[0] } : null,
        error: rows[0] ? null : { message: "not found" },
      });
    },
    then(resolve: (value: { data: Row[]; error: unknown; count: number }) => unknown) {
      const rows = (api["run"] as () => Row[])();
      const error = (mode === "update" || mode === "insert") && fail() ? { message: "write failed" } : null;
      return Promise.resolve(resolve({ data: rows, error, count: rows.length }));
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: () => Promise.resolve(rpcResult),
  },
}));

const actor = { userId: USER, organizationId: ORG, role: "agent" as const };

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  failWrites.clear();
  rpcResult = { data: null, error: null };
  tables["properties"] = [
    {
      id: PROPERTY,
      organization_id: ORG,
      reference: "HB-1001",
      title: "Titlu inițial",
      description: "Descriere inițială",
      status: "active",
      deleted_at: null,
      archived_at: null,
    },
  ];
  tables["marketing_drafts"] = [
    {
      id: DRAFT,
      organization_id: ORG,
      property_id: PROPERTY,
      version: 1,
      source: "ai_generated",
      channel: "olx",
      content_type: "listing",
      tone: "professional",
      length: "standard",
      title: "Titlu ciornă",
      body: "Corpul ciornei salvate.",
      validation_status: "valid",
    },
  ];
  tables["leads"] = [
    {
      id: LEAD,
      organization_id: ORG,
      name: "Lead test",
      stage: "new",
      assigned_to: USER,
      next_followup_at: null,
    },
  ];
  tables["prospects"] = [{ id: PROSPECT, organization_id: ORG, title: "Anunț", status: "approved" }];
  tables["contacts"] = [];
  tables["activities"] = [];
  tables["ai_workflow_runs"] = [
    {
      id: RUN,
      organization_id: ORG,
      user_id: USER,
      workflow: "habitooMarketingWorkflow",
      status: "running",
      claimed_at: new Date(Date.now() - RUN_CLAIM_LEASE_MS - 60_000).toISOString(),
      current_step: "human_approval",
      state: {},
    },
  ];
});

/** Numele de tool-uri folosite din server functions trebuie să existe în registru. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

/**
 * Numele de tool din al doilea argument al fiecărui `executeAiTool(...)`,
 * inclusiv variantele dintr-un operator ternar.
 */
function toolNamesUsedIn(text: string): string[] {
  const names: string[] = [];
  let index = text.indexOf("executeAiTool(");
  while (index !== -1) {
    let cursor = index + "executeAiTool(".length;
    let depth = 0;
    let argument = "";
    let argIndex = 0;
    while (cursor < text.length) {
      const char = text[cursor]!;
      if ("([{".includes(char)) depth += 1;
      else if (")]}".includes(char)) {
        if (depth === 0) break;
        depth -= 1;
      }
      if (char === "," && depth === 0) {
        argIndex += 1;
        if (argIndex === 2) break;
        argument = "";
        cursor += 1;
        continue;
      }
      if (argIndex === 1) argument += char;
      cursor += 1;
    }
    for (const literal of argument.matchAll(/"([a-z0-9_]+)"/g)) names.push(literal[1]!);
    index = text.indexOf("executeAiTool(", index + 1);
  }
  return names;
}

describe("registrul de tool-uri", () => {

  it("fiecare nume de tool executat din cod există în registru și este dispecerizat", () => {
    const root = path.join(process.cwd(), "src");
    const registry = readFileSync(path.join(root, "lib/ai/tools/registry.ts"), "utf8");
    const dispatchers = [
      readFileSync(path.join(root, "lib/ai/tools/executors.server.ts"), "utf8"),
      readFileSync(path.join(root, "lib/ai/agents/crm/tools.server.ts"), "utf8"),
      readFileSync(path.join(root, "lib/ai/agents/marketing/tools.server.ts"), "utf8"),
      readFileSync(path.join(root, "lib/prospecting/tools.server.ts"), "utf8"),
    ].join("\n");


    const used = new Set<string>();
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf8");
      for (const name of toolNamesUsedIn(text)) used.add(name);
    }

    expect(used.has("import_prospect_to_crm")).toBe(true);
    expect(used.has("link_prospect_to_existing_contact")).toBe(true);
    const missing = [...used].filter(
      (name) => !registry.includes(`"${name}"`) || !dispatchers.includes(`"${name}"`),
    );
    expect(missing, `tool-uri lipsă din registru sau nedispecerizate: ${missing.join(", ")}`).toEqual(
      [],
    );
  });
});


describe("rulările blocate se pot relua", () => {
  it("o rulare rămasă „running” peste durata rezervării este preluată din nou", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const claimed = await claimSuspendedRun(supabaseAdmin as never, {
      runId: RUN,
      organizationId: ORG,
      userId: USER,
      workflow: "habitooMarketingWorkflow",
      columns: "id,status",
    });
    expect(claimed).not.toBeNull();
  });

  it("o rulare preluată recent nu poate fi preluată a doua oară", async () => {
    tables["ai_workflow_runs"]![0]!["claimed_at"] = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const claimed = await claimSuspendedRun(supabaseAdmin as never, {
      runId: RUN,
      organizationId: ORG,
      userId: USER,
      workflow: "habitooMarketingWorkflow",
      columns: "id,status",
    });
    expect(claimed).toBeNull();
  });
});

describe("importul prospectului este atomic", () => {
  it("un import eșuat nu lasă contact orfan", async () => {
    rpcResult = { data: null, error: { message: "insert failed" } };
    const { importProspectToCrm } = await import("@/lib/prospecting/import.server");
    const result = await importProspectToCrm(actor, PROSPECT);
    expect(result.ok).toBe(false);
    expect(tables["contacts"]).toHaveLength(0);
    expect(tables["leads"]).toHaveLength(1);
    expect(tables["prospects"]![0]!["status"]).toBe("approved");
  });

  it("propunerea de asociere rămâne neschimbată", async () => {
    rpcResult = {
      data: {
        ok: false,
        code: "needs_link",
        existingContact: { id: "c1", name: "Ion Popescu", phone: "+40700000000" },
      },
      error: null,
    };
    const { importProspectToCrm } = await import("@/lib/prospecting/import.server");
    const result = await importProspectToCrm(actor, PROSPECT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("needs_link");
      expect(result.existingContact?.name).toBe("Ion Popescu");
    }
  });
});

describe("scrierile CRM în doi pași", () => {
  it("create_task raportează eșec parțial când follow-up-ul leadului nu se salvează", async () => {
    failWrites.add("leads");
    const { runCrmTool } = await import("../agents/crm/tools.server");
    const result = await runCrmTool(
      actor,
      "create_task",
      {
        leadId: LEAD,
        title: "Sună clientul",
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
      "write:crm",
      { approvalGranted: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("follow-up");
  });
});

describe("aplicarea textului de marketing", () => {
  it("salvează textul anterior al proprietății ca versiune nouă", async () => {
    const { runMarketingTool } = await import("../agents/marketing/tools.server");
    const result = await runMarketingTool(
      actor,
      "apply_marketing_draft",
      {
        propertyId: PROPERTY,
        draftId: DRAFT,
        title: "Titlu ciornă",
        body: "Corpul ciornei salvate.",
      },
      "write:marketing",
      { approvalGranted: true },
    );
    expect(result.ok).toBe(true);
    const snapshot = tables["marketing_drafts"]!.find(
      (row) => row["source"] === "previous_property_text",
    );
    expect(snapshot).toBeDefined();
    expect(snapshot!["body"]).toBe("Descriere inițială");
    expect(snapshot!["title"]).toBe("Titlu inițial");
    expect(tables["properties"]![0]!["description"]).toBe("Corpul ciornei salvate.");
  });
});
