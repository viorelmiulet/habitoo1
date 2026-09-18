/**
 * Integritatea aprobărilor (comportamental, cu client mockat):
 *  - textul aprobat este exact textul aplicat;
 *  - o aprobare se consumă o singură dată, chiar la două cereri paralele;
 *  - importul fără aprobare este refuzat;
 *  - o decizie din afara agenției este refuzată;
 *  - argumentele modificate după aprobare nu se execută.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPROVAL_TAMPERED,
  argumentsFingerprint,
  claimSuspendedRun,
  fingerprintMatches,
} from "../security/approval";

type Row = Record<string, unknown>;

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROPERTY = "33333333-3333-4333-8333-333333333333";
const DRAFT = "44444444-4444-4444-8444-444444444444";
const PROSPECT = "55555555-5555-4555-8555-555555555555";
const RUN = "66666666-6666-4666-8666-666666666666";

const tables: Record<string, Row[]> = {};

function matches(row: Row, filters: [string, unknown][]): boolean {
  return filters.every(([column, value]) => row[column] === value);
}

function builder(table: string) {
  const filters: [string, unknown][] = [];
  let mode: "select" | "update" | "insert" = "select";
  let values: Row = {};
  let claimed: Row[] = [];

  const api: Record<string, unknown> = {
    select() {
      if (mode !== "update" && mode !== "insert") mode = "select";
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
      tables[table] = tables[table] ?? [];
      tables[table]!.push({ ...next });
      return api;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return api;
    },
    /** Rezervarea expirată: în test nicio rulare nu are `claimed_at` mai vechi. */
    lt() {
      filters.push(["__never", Symbol("never")]);
      return api;
    },
    is() {
      return api;
    },
    gte() {
      return api;
    },
    lte() {
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return api;
    },
    run() {
      const rows = tables[table] ?? [];
      if (mode === "update") {
        claimed = rows.filter((row) => matches(row, filters));
        for (const row of claimed) Object.assign(row, values);
        return claimed;
      }
      if (mode === "insert") return [{ ...values }];
      return rows.filter((row) => matches(row, filters));
    },
    maybeSingle() {
      const rows = (api["run"] as () => Row[])();
      return Promise.resolve({ data: rows[0] ? { ...rows[0] } : null, error: null });
    },
    single() {
      const rows = (api["run"] as () => Row[])();
      return Promise.resolve({
        data: rows[0] ? { ...rows[0] } : null,
        error: rows[0] ? null : { message: "not found" },
      });
    },
    then(resolve: (value: { data: Row[]; error: null; count: number }) => unknown) {
      const rows = (api["run"] as () => Row[])();
      return Promise.resolve(resolve({ data: rows, error: null, count: rows.length }));
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

const actor = { userId: USER, organizationId: ORG, role: "agent" as const };

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
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
      title: "Titlu ciornă",
      body: "Corpul ciornei salvate.",
      validation_status: "valid",
    },
  ];
  tables["prospects"] = [{ id: PROSPECT, organization_id: ORG, title: "Anunț", status: "new" }];
  tables["ai_workflow_runs"] = [
    {
      id: RUN,
      organization_id: ORG,
      user_id: USER,
      workflow: "habitooMarketingWorkflow",
      status: "suspended",
      current_step: "human_approval",
      state: {},
      trace_id: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    },
  ];
});

describe("textul aprobat este textul aplicat", () => {
  it("refuză aplicarea când ciorna salvată diferă de textul aprobat", async () => {
    const { runMarketingTool } = await import("../agents/marketing/tools.server");
    const result = await runMarketingTool(
      actor,
      "apply_marketing_draft",
      { propertyId: PROPERTY, draftId: DRAFT, title: "Titlu aprobat", body: "Alt text aprobat." },
      "write:marketing",
      { approvalGranted: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("nu mai corespunde");
    expect(tables["properties"]![0]!["description"]).toBe("Descriere inițială");
  });

  it("aplică textul când corespunde ciornei aprobate", async () => {
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
    expect(tables["properties"]![0]!["description"]).toBe("Corpul ciornei salvate.");
  });
});

describe("aprobarea se consumă o singură dată", () => {
  it("două cereri paralele preiau rularea o singură dată", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const claim = () =>
      claimSuspendedRun(supabaseAdmin as never, {
        runId: RUN,
        organizationId: ORG,
        userId: USER,
        workflow: "habitooMarketingWorkflow",
        columns: "id,status",
      });
    const [first, second] = await Promise.all([claim(), claim()]);
    const wins = [first, second].filter(Boolean);
    expect(wins).toHaveLength(1);
  });
});

describe("importul și decizia cer aprobare și autorizare", () => {
  it("importul fără aprobare este refuzat", async () => {
    const { runProspectingTool } = await import("@/lib/prospecting/tools.server");
    const result = await runProspectingTool(
      actor,
      "import_prospect_to_crm",
      { prospectId: PROSPECT },
      "write:prospect",
      { approvalGranted: false },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("denied");
  });

  it("un actor din altă agenție nu poate decide asupra oportunității", async () => {
    const { runProspectingTool } = await import("@/lib/prospecting/tools.server");
    const result = await runProspectingTool(
      { userId: USER, organizationId: OTHER_ORG, role: "agent" },
      "approve_prospect",
      { prospectId: PROSPECT },
      "write:prospect",
      { approvalGranted: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_found");
    expect(tables["prospects"]![0]!["status"]).toBe("new");
  });
});

describe("amprenta argumentelor", () => {
  it("argumentele modificate după aprobare nu mai corespund amprentei", () => {
    const original = JSON.stringify({ propertyId: PROPERTY, body: "Text aprobat" });
    const hash = argumentsFingerprint(original);
    expect(fingerprintMatches(hash, original)).toBe(true);
    expect(
      fingerprintMatches(hash, JSON.stringify({ propertyId: PROPERTY, body: "Text schimbat" })),
    ).toBe(false);
    expect(APPROVAL_TAMPERED).toContain("nu am executat nimic");
  });

  it("ordinea cheilor nu schimbă amprenta", () => {
    expect(argumentsFingerprint('{"a":1,"b":2}')).toBe(argumentsFingerprint('{"b":2,"a":1}'));
  });
});
