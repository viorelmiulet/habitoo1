import { describe, expect, it, vi } from "vitest";

vi.mock("../credentials.server", () => ({
  hasLaCheieCrmApiKey: () => true,
  laCheieCrmApiKey: () => "test-key",
}));
const request = vi.fn();
vi.mock("../client.server", () => ({
  laCheieRequest: (...args: unknown[]) => request(...args),
  withLaCheieWriteLock: async (_k: unknown, fn: () => unknown) => fn(),
}));

import {
  laCheieConnectionTestFailure,
  planLaCheieAgencyOperation,
  readLaCheieAgencyState,
} from "../agency";

const REASON =
  "Emailul administratorului este folosit la La Cheie de un cont personal/de agent sau agenția are deja o conexiune individuală. Contactați La Cheie.";
const errorSettings = {
  lacheie_agency_external_id: "hbt-abc123",
  lacheie_agency_status: "error",
  lacheie_agency_version: "1",
  lacheie_agency_error: REASON,
};

describe("La Cheie — refuz la înregistrarea agenției", () => {
  it("agenție cu status error → testul eșuează cu mesajul La Cheie și identificatorul", async () => {
    const { lacheieAdapter } = await import("../../adapters/lacheie.server");
    const result = await lacheieAdapter.testConnection({
      organizationId: "00000000-0000-0000-0000-000000000001",
      settings: errorSettings,
    } as never);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("CONFIG_ERROR");
    expect(result.message).toBe(
      `La Cheie a refuzat înregistrarea agenției: ${REASON} Identificatorul agenției la La Cheie: hbt-abc123.`,
    );
    expect(result.message).not.toContain("Configurarea este completă");
    expect(request).not.toHaveBeenCalled();
  });

  it("agenție activă → nicio blocare la test", () => {
    const state = readLaCheieAgencyState({
      lacheie_agency_external_id: "hbt-abc123",
      lacheie_agency_status: "active",
      lacheie_agency_version: "1",
      lacheie_agency_accepted_version: "1",
    });
    expect(laCheieConnectionTestFailure(state)).toBeNull();
  });

  it("„Reîncearcă înregistrarea” trimite o versiune mai mare", () => {
    const state = readLaCheieAgencyState(errorSettings);
    const plan = planLaCheieAgencyOperation({
      state,
      pending: null,
      operation: "register",
      bodyHash: "h",
    });
    expect(Number(plan.version)).toBeGreaterThan(1);
  });
});
