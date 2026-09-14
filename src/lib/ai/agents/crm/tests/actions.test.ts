import { describe, expect, it } from "vitest";
import {
  CRM_ACTION_TOOLS,
  crmActionIdempotencyKey,
  isCrmActionTool,
  validateCrmAction,
} from "../actions";

const LEAD = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

describe("acțiuni CRM", () => {
  it("lista de acțiuni nu conține comunicare automată", () => {
    for (const forbidden of ["send_email", "send_whatsapp", "send_sms", "publish_portal", "call_owner"]) {
      expect(CRM_ACTION_TOOLS as readonly string[]).not.toContain(forbidden);
    }
  });

  it("respinge un tool necunoscut", () => {
    expect(isCrmActionTool("delete_lead")).toBe(false);
    expect(validateCrmAction("delete_lead", {}).ok).toBe(false);
  });

  it("cere o entitate pentru task și notă", () => {
    const result = validateCrmAction("create_task", {
      title: "Follow-up client",
      dueAt: "2026-03-11T09:00:00.000Z",
    });
    expect(result.ok).toBe(false);
  });

  it("acceptă un task valid legat de un lead", () => {
    const result = validateCrmAction("create_task", {
      leadId: LEAD,
      title: "Follow-up client",
      dueAt: "2026-03-11T09:00:00.000Z",
    });
    expect(result.ok).toBe(true);
  });

  it("respinge un termen invalid", () => {
    const result = validateCrmAction("create_task", {
      leadId: LEAD,
      title: "Follow-up client",
      dueAt: "mâine dimineață",
    });
    expect(result.ok).toBe(false);
  });

  it("respinge o etapă inexistentă", () => {
    expect(validateCrmAction("update_lead_status", { leadId: LEAD, stage: "super" }).ok).toBe(false);
    expect(validateCrmAction("update_lead_status", { leadId: LEAD, stage: "contacted" }).ok).toBe(
      true,
    );
  });

  it("respinge un ID care nu este UUID", () => {
    expect(validateCrmAction("assign_lead", { leadId: "1", assigneeId: USER }).ok).toBe(false);
  });

  it("aceeași acțiune produce aceeași cheie de idempotență", () => {
    const args = JSON.stringify({
      leadId: LEAD,
      title: "Follow-up client",
      dueAt: "2026-03-11T09:00:00.000Z",
    });
    const key = crmActionIdempotencyKey("org-1", { tool: "create_task", argumentsJson: args });
    expect(key).toBe(
      crmActionIdempotencyKey("org-1", { tool: "create_task", argumentsJson: args }),
    );
    expect(key).not.toBe(
      crmActionIdempotencyKey("org-2", { tool: "create_task", argumentsJson: args }),
    );
  });
});
