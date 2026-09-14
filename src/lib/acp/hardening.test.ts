/**
 * Stage 8 – Production Hardening: reguli de protecție și erori sigure.
 */
import { describe, expect, it } from "vitest";
import {
  ACP_DUPLICATE_RUN_WINDOW_SECONDS,
  acpSourcesSchema,
  canRecalculateInPlace,
  shouldReuseRunningAnalysis,
} from "./guards";
import { acpDbError, acpError, acpSafeMessage, isAcpSafeError } from "./safe-error";

describe("validarea surselor ACP", () => {
  it("acceptă doar sursele cunoscute", () => {
    expect(acpSourcesSchema.parse({ own_properties: true, portal: false })).toEqual({
      own_properties: true,
      portal: false,
    });
  });

  it("respinge chei necunoscute sau valori care nu sunt booleene", () => {
    expect(() => acpSourcesSchema.parse({ "drop table": true })).toThrow();
    expect(() => acpSourcesSchema.parse({ own_properties: "yes" })).toThrow();
  });

  it("revine la portofoliul propriu când nu se trimite nimic", () => {
    expect(acpSourcesSchema.parse(undefined)).toEqual({ own_properties: true });
    expect(acpSourcesSchema.parse({})).toEqual({ own_properties: true });
  });
});

describe("protecție la rulări duplicate", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("reutilizează o rulare pornită în fereastra de protecție", () => {
    expect(
      shouldReuseRunningAnalysis(
        { status: "running", createdAt: "2026-01-01T11:59:30.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("nu reutilizează rulări vechi, finalizate sau inexistente", () => {
    const old = new Date(now.getTime() - (ACP_DUPLICATE_RUN_WINDOW_SECONDS + 10) * 1000);
    expect(shouldReuseRunningAnalysis({ status: "running", createdAt: old.toISOString() }, now)).toBe(
      false,
    );
    expect(
      shouldReuseRunningAnalysis({ status: "completed", createdAt: now.toISOString() }, now),
    ).toBe(false);
    expect(shouldReuseRunningAnalysis(null, now)).toBe(false);
  });
});

describe("imutabilitatea versiunilor livrate", () => {
  it("permite recalcularea în loc pentru o versiune fără livrabile", () => {
    expect(
      canRecalculateInPlace({ status: "completed", hasReport: false, hasAiInsight: false }),
    ).toEqual({ allowed: true });
  });

  it("blochează recalcularea unei versiuni cu raport sau interpretare AI", () => {
    const withReport = canRecalculateInPlace({
      status: "completed",
      hasReport: true,
      hasAiInsight: false,
    });
    const withAi = canRecalculateInPlace({
      status: "completed",
      hasReport: false,
      hasAiInsight: true,
    });
    expect(withReport.allowed).toBe(false);
    expect(withAi.allowed).toBe(false);
    if (!withReport.allowed) expect(withReport.reason).toBe("locked");
    if (!withAi.allowed) expect(withAi.reason).toBe("locked");
  });

  it("blochează un al doilea request în timp ce analiza rulează", () => {
    const verdict = canRecalculateInPlace({
      status: "running",
      hasReport: false,
      hasAiInsight: false,
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("running");
  });
});

describe("erori sigure pentru client", () => {
  it("păstrează mesajele explicite", () => {
    const error = acpError("Analiza nu a fost găsită în agenția ta.");
    expect(isAcpSafeError(error)).toBe(true);
    expect(acpSafeMessage(error)).toBe("Analiza nu a fost găsită în agenția ta.");
  });

  it("nu expune detalii tehnice din erorile de bază de date", () => {
    const original = {
      message: 'permission denied for table acp_analyses',
      details: "service_role key",
      hint: "GRANT SELECT",
    };
    const safe = acpDbError("test scope", original);
    expect(safe.message).not.toContain("acp_analyses");
    expect(safe.message).not.toContain("service_role");
    expect(safe.message).not.toContain("GRANT");
  });

  it("înlocuiește erorile necunoscute cu un mesaj generic", () => {
    expect(acpSafeMessage(new Error("SELECT * FROM acp_analyses failed: 42501"))).not.toContain(
      "SELECT",
    );
  });
});
