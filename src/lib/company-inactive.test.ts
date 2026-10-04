import { describe, expect, it } from "vitest";
import { parseAnafResponse, buildOrgSyncPatch, companyStatePatch, inactiveWarning } from "./company-lookup";
import { notifyImospotForRequest } from "./portals/imospot-key-request";

const body = (inactiv: Record<string, unknown>) => ({
  found: [{ date_generale: { cui: 40930967, denumire: "X SRL", nrRegCom: "J40/1/2019", stare_inregistrare: "INREGISTRAT din data 01.01.2019" }, stare_inactiv: inactiv }],
});
const now = new Date("2026-10-04T10:00:00Z");

describe("firme inactive ANAF", () => {
  it("firmă inactivă: stare + dată + avertisment", () => {
    const c = parseAnafResponse(body({ statusInactivi: true, dataInactivare: "2021-12-07", dataReactivare: "" }), "40930967")!;
    expect(c.status).toBe("inactiva");
    expect(c.inactiveSince).toBe("2021-12-07");
    expect(companyStatePatch(c, now).company_inactive_since).toBe("2021-12-07");
    expect(inactiveWarning(c.inactiveSince)).toBe("Conform ANAF, această firmă figurează ca inactivă fiscal din 7 decembrie 2021");
  });
  it("firmă reactivată: activă, fără dată de inactivare", () => {
    const c = parseAnafResponse(body({ statusInactivi: false, dataInactivare: "2021-12-07", dataReactivare: "2023-01-10" }), "40930967")!;
    expect(c.status).toBe("activa");
    expect(companyStatePatch(c, now)).toMatchObject({ company_status: "activa", company_inactive_since: null });
  });
  it("firmă activă: patch neschimbat ca formă", () => {
    const c = parseAnafResponse(body({ statusInactivi: false }), "40930967")!;
    const p = buildOrgSyncPatch({} as never, c, now);
    expect(p.company_status).toBe("activa");
    expect(p.company_inactive_since).toBeNull();
  });
  it("ANAF indisponibil: nu există companie, starea nu se schimbă", () => {
    expect(parseAnafResponse(null, "40930967")).toBeNull();
  });
});

describe("Imospot nu e blocat de starea ANAF", () => {
  const company = { agencyName: "A", legalName: "X SRL", cui: "40930967", tradeRegistryNumber: "J40/1/2019", adminName: "Ion", adminEmail: "a@b.ro", adminPhone: "0722123456", city: "București" };
  it("firmă inactivă → cererea pleacă (simulat), ca la una activă", async () => {
    let sent = 0;
    const deps = {
      loadRequest: async () => ({ id: "r", organizationId: "o", portal: "imospot", status: "approved", notifyRequired: true, notifiedAt: null, requestedBy: null }),
      loadCompany: async () => ({ ...company, companyStatus: "inactiva" }),
      loadSettings: async () => ({ to: "info@imospot.ro", from: "contact@habitoo.ro", cc: "contact@habitoo.ro" }),
      send: async () => { sent++; return { ok: true }; },
      save: async () => {},
      audit: async () => {},
    };
    expect((await notifyImospotForRequest(deps as never, "r")).status).toBe("sent");
    expect(sent).toBe(1);
  });
});
