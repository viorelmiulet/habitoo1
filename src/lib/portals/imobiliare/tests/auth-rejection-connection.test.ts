/**
 * IM1: mesajul de credențiale refuzate trebuie să ajungă la „Testează
 * conexiunea" și în jurnal cu codul AUTH_ERROR, nu mascat în CONFIG_ERROR.
 */
import { describe, expect, it, vi } from "vitest";

const EXPECTED_MESSAGE =
  "Imobiliare.ro nu acceptă utilizatorul sau parola. Folosește datele de acces API primite de la Imobiliare.ro pentru integrarea cu un CRM, nu datele de logare de pe site.";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({}) }) }) }) },
}));

vi.mock("../auth.server", () => ({
  getImobiliareSession: vi.fn(async () => ({
    ok: false as const,
    code: "AUTH_ERROR" as const,
    message: EXPECTED_MESSAGE,
    detail: "login_failed",
  })),
  imobiliareAuthedRequest: vi.fn(),
}));

import { imobiliareAdapter } from "../../adapters/imobiliare.server";

describe("conexiunea Imobiliare.ro cu credențiale refuzate", () => {
  it("Testează conexiunea afișează mesajul de credențiale cu codul AUTH_ERROR", async () => {
    const result = await imobiliareAdapter.testConnection({
      organizationId: "org-test",
      externalAccountId: "agentie",
      portalCredential: "parola-gresita",
      allowLiveRequests: true,
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AUTH_ERROR");
      expect(result.message).toBe(EXPECTED_MESSAGE);
    }
  });
});
