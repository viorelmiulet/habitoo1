import { describe, expect, it } from "vitest";
import { renderRentalAgreement, renderTemplate } from "./templates";

describe("contract templates", () => {
  it("does not leak null or undefined values", () => {
    const body = renderRentalAgreement({
      signingDate: "13.09.2026",
      landlord: { fullName: "Ana Pop", idNumber: "123456", idSeries: null },
      tenant: { fullName: "Ion Ionescu", idNumber: "0318680", idSeries: undefined },
      rooms: 2,
      propertyAddress: "Str. Exemplu nr. 1",
      currency: "EUR",
    });
    expect(body).toContain("C.I.: nr. 0318680");
    expect(body).not.toContain("seria null");
    expect(body).not.toMatch(/null|undefined/);
  });

  it("keeps the supplied legal clauses unchanged", () => {
    const body = renderRentalAgreement({ landlord: {}, tenant: {} });
    expect(body).toContain("Neplata chiriei in termen de 5 zile constituie o incalcare a contractului");
    expect(body).toContain("prin denuntare unilaterala de catre oricare dintre parti, cu o notificare prealabila de 30 de zile.");
  });

  it("renders missing generic variables as blanks", () => {
    expect(renderTemplate("CNP {{client.cnp}}", {})).toBe("CNP __________");
  });
});