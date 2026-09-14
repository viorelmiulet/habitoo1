import { describe, expect, it, vi } from "vitest";
import { ACP_AUDIT_ACTIONS, buildAcpAuditRow, writeAcpAudit } from "./audit";

function fakeClient(error: { message: string } | null = null) {
  const inserted: unknown[] = [];
  return {
    inserted,
    from(table: "audit_logs") {
      expect(table).toBe("audit_logs");
      return {
        insert: async (row: unknown) => {
          inserted.push(row);
          return { error };
        },
      };
    },
  };
}

describe("auditul ACP", () => {
  it("construiește rândul cu entitatea și detaliile analizei", () => {
    const row = buildAcpAuditRow({
      organizationId: "org-1",
      actorId: "user-1",
      action: ACP_AUDIT_ACTIONS.analysisCreated,
      analysisId: "analysis-1",
      details: { propertyId: "prop-1" },
    });
    expect(row).toEqual({
      organization_id: "org-1",
      actor_id: "user-1",
      action: "acp.analysis.created",
      entity: "acp_analysis",
      entity_id: "analysis-1",
      new_values: { propertyId: "prop-1" },
    });
  });

  it("nu scrie nimic fără agenție", async () => {
    const client = fakeClient();
    const ok = await writeAcpAudit(client, {
      organizationId: null,
      actorId: "user-1",
      action: ACP_AUDIT_ACTIONS.analysisRun,
    });
    expect(ok).toBe(false);
    expect(client.inserted).toHaveLength(0);
  });

  it("persistă acțiunea cu clientul de serviciu", async () => {
    const client = fakeClient();
    const ok = await writeAcpAudit(client, {
      organizationId: "org-1",
      actorId: "user-1",
      action: ACP_AUDIT_ACTIONS.reportGenerated,
      analysisId: "analysis-1",
    });
    expect(ok).toBe(true);
    expect(client.inserted).toHaveLength(1);
  });

  it("rămâne best-effort când inserarea eșuează", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient({ message: "denied" });
    const ok = await writeAcpAudit(client, {
      organizationId: "org-1",
      actorId: "user-1",
      action: ACP_AUDIT_ACTIONS.aiGenerated,
      analysisId: "analysis-1",
    });
    expect(ok).toBe(false);
    spy.mockRestore();
  });
});
