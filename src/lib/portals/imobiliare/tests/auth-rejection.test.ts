/**
 * IM1: când Imobiliare.ro refuză utilizatorul sau parola la autorizare,
 * mesajul trebuie să spună exact asta, cu codul AUTH_ERROR — nu mesajul de
 * validare a anunțului. Mesajul „a respins datele anunțului" rămâne doar
 * pentru erorile de validare la trimiterea unui anunț.
 */
import { describe, expect, it, vi } from "vitest";

const AUTH_BODY = { message: "Credentialele utilizatorului au fost incorecte" };

// Transportul portalului: răspunsul real al Imobiliare.ro la credențiale greșite.
vi.mock("../../relay.server", () => ({
  relayFetch: vi.fn(async () =>
    new Response(JSON.stringify(AUTH_BODY), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
  ),
}));

import { classifyImobiliareStatus, IMOBILIARE_AUTH_REJECTED_MESSAGE } from "../http";
import { getImobiliareSession } from "../auth.server";

const EXPECTED_MESSAGE =
  "Imobiliare.ro nu acceptă utilizatorul sau parola. Folosește datele de acces API primite de la Imobiliare.ro pentru integrarea cu un CRM, nu datele de logare de pe site.";

describe("autorizare refuzată de Imobiliare.ro", () => {
  it("mesajul cerut este exact cel afișat", () => {
    expect(IMOBILIARE_AUTH_REJECTED_MESSAGE).toBe(EXPECTED_MESSAGE);
  });

  it("eroare de la endpointul de autorizare → AUTH_ERROR cu mesajul despre datele de acces API", () => {
    const result = classifyImobiliareStatus({ status: 400, attempt: 1, endpoint: "auth" });
    expect(result.code).toBe("AUTH_ERROR");
    expect(result.message).toBe(EXPECTED_MESSAGE);
    expect(result.action).toBe("stop");
  });

  it("401/403/422 la autorizare sunt tot refuz de credențiale", () => {
    for (const status of [401, 403, 422]) {
      const result = classifyImobiliareStatus({ status, attempt: 1, endpoint: "auth" });
      expect(result.code).toBe("AUTH_ERROR");
      expect(result.message).toBe(EXPECTED_MESSAGE);
    }
  });

  it("limitarea și erorile temporare de la autorizare nu devin refuz de credențiale", () => {
    expect(classifyImobiliareStatus({ status: 429, attempt: 1, endpoint: "auth" }).code).toBe(
      "RATE_LIMIT",
    );
    expect(classifyImobiliareStatus({ status: 503, attempt: 1, endpoint: "auth" }).code).toBe(
      "PORTAL_ERROR",
    );
  });

  it("validarea unui anunț păstrează mesajul vechi, neschimbat", () => {
    const result = classifyImobiliareStatus({ status: 422, attempt: 1 });
    expect(result.code).toBe("INVALID_REQUEST");
    expect(result.message).toContain("a respins datele anunțului");
    expect(result.message).toContain("Corectează câmpurile semnalate");
    expect(result.message).not.toContain("nu acceptă utilizatorul");
  });

  it("credențiale greșite → AUTH_ERROR, nu mesajul de validare a anunțului", async () => {
    const result = await getImobiliareSession({
      admin: {} as never,
      organizationId: "org-test",
      username: "agentie",
      credential: "parola-gresita",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AUTH_ERROR");
      expect(result.message).toBe(EXPECTED_MESSAGE);
      expect(result.detail).toBe("login_failed");
    }
  });

  it("fără credențiale salvate rămâne problemă de configurare", async () => {
    const result = await getImobiliareSession({
      admin: {} as never,
      organizationId: "org-test",
      username: "agentie",
      credential: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFIG_ERROR");
  });
});
