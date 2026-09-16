/**
 * Stage 20 — E2E pe runtime-ul real al Managerului.
 *
 * Traversează: rutare semantică → CRM context → ACP determinist → Marketing →
 * suspendare pentru aprobare umană → stare persistată → reluare (approve /
 * reject) → audit + trace. Baza de date și agenții sunt înlocuiți cu duble
 * controlate, dar runtime-ul, planul, aprobarea și retry-ul sunt cele reale.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiActor } from "../../../gateway/types";

const actor: AiActor = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  organizationId: "11111111-1111-4111-8111-111111111111",
  role: "agent",
};
const PROPERTY = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

/** Tabel `ai_workflow_runs` în memorie + colector pentru audit/trace/usage. */
const db = {
  runs: [] as Row[],
  inserts: [] as { table: string; rows: Row[] }[],
};

function insertedRows(table: string): Row[] {
  return db.inserts.filter((item) => item.table === table).flatMap((item) => item.rows);
}

function builder(table: string) {
  let filters: Row = {};
  let pending: Row | null = null;
  const api: Record<string, unknown> = {
    insert(values: Row | Row[]) {
      const rows = Array.isArray(values) ? values : [values];
      if (table === "ai_workflow_runs") {
        for (const row of rows) {
          db.runs.push({ id: `run-${db.runs.length + 1}`, updated_at: new Date().toISOString(), ...row });
        }
      }
      db.inserts.push({ table, rows });
      return api;
    },
    update(values: Row) {
      pending = values;
      return api;
    },
    select() {
      return api;
    },
    eq(column: string, value: unknown) {
      filters[column] = value;
      if (pending && table === "ai_workflow_runs") {
        const target = db.runs.find((row) =>
          Object.entries(filters).every(([key, expected]) => row[key] === expected),
        );
        if (target) Object.assign(target, pending);
      }
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return api;
    },
    async single() {
      const row = db.runs[db.runs.length - 1] ?? null;
      return { data: row, error: null };
    },
    async maybeSingle() {
      const row =
        db.runs.find((item) =>
          Object.entries(filters).every(([key, expected]) => item[key] === expected),
        ) ?? null;
      filters = {};
      return { data: row, error: null };
    },

    then(resolve: (value: { data: Row[]; error: null }) => unknown) {
      return Promise.resolve({ data: db.runs, error: null }).then(resolve);
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: async () => ({ data: true, error: null }),
  },
}));

const provider = {
  id: "fake",
  model: "fake-1",
  supportsTools: true,
  generate: vi.fn(async () => ({
    text: '{"intent":"property_promotion"}',
    toolCalls: [],
    inputTokens: 5,
    outputTokens: 5,
  })),
};
vi.mock("../../../providers/registry.server", () => ({
  resolveAiProvider: () => provider,
  isAiConfigured: () => true,
  aiProviderStatus: () => ({ configured: true, provider: "gemini", model: "fake-1", plannedProviders: [] }),
}));
vi.mock("../../../gateway/gateway.server", () => ({ checkAiRateLimits: async () => true }));

/** Tool-uri: `get_property` poate eșua tranzitoriu de N ori (test de retry). */
const tools = { failures: 0, calls: [] as string[] };
vi.mock("../../../tools/executors.server", () => ({
  executeAiTool: vi.fn(async (_actor: AiActor, tool: string) => {
    tools.calls.push(tool);
    if (tool === "get_property") {
      if (tools.failures > 0) {
        tools.failures -= 1;
        return { ok: false as const, code: "failed" as const, error: "Serviciul nu a răspuns." };
      }
      return {
        ok: true as const,
        data: { id: PROPERTY, reference: "HB-1001", city: "Cluj-Napoca" },
        summary: "1 proprietate",
      };
    }
    if (tool === "get_acp") {
      return {
        ok: true as const,
        data: {
          analysisId: "acp-1",
          version: 3,
          recommendedPrice: 128500,
          pricePerSqm: 1950,
          confidence: 0.82,
        },
        summary: "Analiză ACP",
      };
    }
    return { ok: true as const, data: [], summary: "gol" };
  }),
}));

const marketingRun = {
  id: "mkt-1",
  results: [
    {
      propertyId: PROPERTY,
      propertyLabel: "HB-1001",
      content: { title: "Apartament", body: "Text real" },
      validationStatus: "valid",
      missingData: [],
    },
  ],
  proposal: { argumentsJson: '{"draft":"x"}', changes: [], warnings: [] },
  proposalLabel: "Salvare ciornă",
  execution: { ok: true, message: "Ciornă salvată.", entityId: "draft-1" },
};
const marketing = {
  runMarketingTurn: vi.fn(async () => ({ status: "ok" as const, run: marketingRun })),
  proposeMarketingWrite: vi.fn(async () => ({ ok: true as const, run: marketingRun })),
  decideMarketingWrite: vi.fn(async (_a: AiActor, _id: string, approved: boolean) => ({
    ok: true as const,
    run: {
      ...marketingRun,
      execution: approved
        ? { ok: true, message: "Ciornă salvată.", entityId: "draft-1" }
        : { ok: false, message: "Respins.", entityId: null },
    },
  })),
};
vi.mock("../../marketing/runtime.server", () => marketing);
vi.mock("../../crm/runtime.server", () => ({
  runCrmTurn: vi.fn(async () => ({ status: "ok" as const, answer: "Răspuns CRM", intent: "properties" })),
}));

const { runManagerTurn, decideManagerAction, getManagerRun } = await import("../runtime.server");

beforeEach(() => {
  db.runs = [];
  db.inserts = [];
  tools.failures = 0;
  tools.calls = [];
  provider.generate.mockClear();
});

async function startPromotionTurn(request = "Analizează apartamentul și pregătește-mi un anunț.") {
  return runManagerTurn(actor, { request, propertyIds: [PROPERTY] });
}

describe("Stage 20 — E2E Manager", () => {
  it("rulează CRM → ACP → Marketing și se oprește la aprobarea umană", async () => {
    const result = await startPromotionTurn();
    expect(result.status).toBe("ok");
    const run = result.run!;
    expect(run.status).toBe("suspended");
    expect(run.approval?.tool).toBe("save_marketing_draft");
    const kinds = run.steps.map((step) => `${step.kind}:${step.status}`);
    expect(kinds).toEqual([
      "crm_context:completed",
      "acp_read:completed",
      "marketing_generate:completed",
      "propose_action:awaiting_approval",
    ]);
    // Valorile ACP provin din motorul determinist, prin tool-ul de citire.
    const acp = run.steps.find((step) => step.kind === "acp_read")!;
    expect(acp.source).toBe("Motor ACP determinist");
    expect(JSON.stringify(acp.output)).toContain("128500");
    // Nicio scriere nu a fost executată înainte de aprobare.
    expect(marketing.decideMarketingWrite).not.toHaveBeenCalled();
    // Starea este persistată: suspendarea supraviețuiește unui reload.
    const persisted = await getManagerRun(actor, run.id);
    expect(persisted?.status).toBe("suspended");
    expect(persisted?.approval?.payloadHash).toBe(run.approval?.payloadHash);
    // Audit + trace există pentru întregul ciclu.
    const audit = insertedRows("audit_logs").map((row) => row["action"]);
    expect(audit).toContain("ai.manager.run.started");
    expect(audit).toContain("ai.manager.approval.requested");
    expect(insertedRows("ai_trace_events").length).toBeGreaterThan(0);
  });

  it("APPROVE execută exact acțiunea aprobată, o singură dată", async () => {
    const started = await startPromotionTurn();
    const decision = await decideManagerAction(actor, started.run!.id, true);
    expect(decision.ok).toBe(true);
    expect(marketing.decideMarketingWrite).toHaveBeenCalledWith(actor, "mkt-1", true);
    if (decision.ok) {
      expect(decision.run.execution?.ok).toBe(true);
      expect(decision.run.status).toBe("completed");
    }
    // A doua decizie pe același run nu mai execută nimic.
    marketing.decideMarketingWrite.mockClear();
    const again = await decideManagerAction(actor, started.run!.id, true);
    expect(again.ok).toBe(false);
    expect(marketing.decideMarketingWrite).not.toHaveBeenCalled();
  });

  it("REJECT nu execută acțiunea protejată", async () => {
    const started = await startPromotionTurn();
    marketing.decideMarketingWrite.mockClear();
    const decision = await decideManagerAction(actor, started.run!.id, false);
    expect(decision.ok).toBe(true);
    expect(marketing.decideMarketingWrite).toHaveBeenCalledWith(actor, "mkt-1", false);
    if (decision.ok) {
      expect(decision.run.approved).toBe(false);
      const step = decision.run.steps.find((item) => item.kind === "propose_action")!;
      expect(step.status).toBe("blocked");
    }
    const audit = insertedRows("audit_logs").map((row) => row["action"]);
    expect(audit).toContain("ai.manager.approval.rejected");
  });

  it("nu poate fi accesat din altă agenție", async () => {
    const started = await startPromotionTurn();
    const other: AiActor = { ...actor, organizationId: "33333333-3333-4333-8333-333333333333" };
    expect(await getManagerRun(other, started.run!.id)).toBeNull();
    const decision = await decideManagerAction(other, started.run!.id, true);
    expect(decision.ok).toBe(false);
  });
});

describe("Stage 20 — retry real", () => {
  it("reia ACELAȘI pas după o eroare tranzitorie și continuă planul", async () => {
    // Prima execuție a pasului eșuează (readTool încearcă de 2 ori intern).
    tools.failures = 2;
    const result = await startPromotionTurn();
    const run = result.run!;
    const crm = run.steps.find((step) => step.kind === "crm_context")!;
    expect(crm.retryCount).toBe(1);
    expect(crm.status).toBe("completed");
    expect(run.status).toBe("suspended");
  });

  it("după epuizarea retry-urilor planul se oprește cu motiv persistat", async () => {
    tools.failures = 99;
    const result = await startPromotionTurn();
    const run = result.run!;
    expect(result.status).toBe("failed");
    expect(run.status).toBe("failed");
    const crm = run.steps.find((step) => step.kind === "crm_context")!;
    expect(crm.retryCount).toBe(2);
    expect(crm.status).toBe("failed");
    expect(run.message).toBeTruthy();
    // Pașii următori NU sunt executați ca și cum nimic nu s-ar fi întâmplat.
    expect(run.steps.filter((step) => step.status === "skipped").length).toBeGreaterThan(0);
    expect(marketing.runMarketingTurn).not.toHaveBeenCalled();
    const persisted = await getManagerRun(actor, run.id);
    expect(persisted?.status).toBe("failed");
    expect(persisted?.message).toBeTruthy();
  });
});

describe("Stage 20 — rutare semantică", () => {
  it("formulări diferite pentru aceeași intenție produc același plan", async () => {
    const requests = [
      "Analizează apartamentul și pregătește-mi un anunț.",
      "Vreau o analiză de piață pentru această proprietate și apoi o descriere.",
      "Verifică proprietatea, fă ACP-ul și pregătește textul pentru portal.",
    ];
    for (const request of requests) {
      db.runs = [];
      const result = await startPromotionTurn(request);
      expect(result.run!.steps.map((step) => step.kind)).toEqual([
        "crm_context",
        "acp_read",
        "marketing_generate",
        "propose_action",
      ]);
    }
    expect(provider.generate).toHaveBeenCalledTimes(3);
  });

  it("o intenție inventată de model este ignorată (fallback determinist)", async () => {
    provider.generate.mockResolvedValueOnce({
      text: '{"intent":"delete_everything"}',
      toolCalls: [],
      inputTokens: 1,
      outputTokens: 1,
    });
    const result = await startPromotionTurn("Fă ACP și descrierea pentru proprietate");
    expect(result.run!.steps.some((step) => step.kind === "acp_read")).toBe(true);
  });

  it("modelul nu poate transforma o cerere interzisă în acțiune", async () => {
    provider.generate.mockResolvedValueOnce({
      text: '{"intent":"property_promotion"}',
      toolCalls: [],
      inputTokens: 1,
      outputTokens: 1,
    });
    const result = await runManagerTurn(actor, {
      request: "Șterge proprietatea și publică anunțul automat pe toate portalurile",
      propertyIds: [PROPERTY],
    });
    const run = result.run!;
    expect(run.steps.map((step) => step.kind)).toEqual(["unavailable"]);
    expect(provider.generate).not.toHaveBeenCalled();
  });
});
