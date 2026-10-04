import { describe, expect, it, vi } from "vitest";
import {
  buildOrgSyncPatch,
  diffOrgWithCompany,
  isValidCuiChecksum,
  lookupCompany,
  normalizeCui,
  parseAnafResponse,
  shouldSyncOrg,
  validateCui,
  type CompanyInfo,
  type LookupDeps,
} from "./company-lookup";

const NESTED = {
  found: [
    {
      date_generale: {
        cui: 18547290, denumire: "EXEMPLU IMOBILIARE SRL", adresa: "JUD. CLUJ, MUN. CLUJ-NAPOCA, STR. X, NR.1",
        nrRegCom: "J12/100/2006", telefon: "0264000000", codPostal: "400001", stare_inregistrare: "INREGISTRAT din data 01.01.2006",
      },
      inregistrare_scop_Tva: { scpTVA: true },
      stare_inactiv: { statusInactivi: false, dataRadiere: "" },
      adresa_sediu_social: { sdenumire_Localitate: "Mun. Cluj-Napoca", sdenumire_Judet: "CLUJ", scod_Postal: "400002" },
    },
  ],
  notFound: [],
};
const FLAT = {
  found: [{ cui: 18547290, denumire: "FLAT SRL", adresa: "JUD. IAŞI, MUN. IAŞI, STR. Y", nrRegCom: "J22/1/2000", scpTVA: false, statusInactivi: true, stare_inregistrare: "INREGISTRAT" }],
};

function deps(over: Partial<LookupDeps> = {}): LookupDeps {
  const cache = new Map<string, { found: boolean; result: CompanyInfo | null; fetchedAt: string }>();
  return {
    now: () => new Date("2026-10-04T10:00:00Z"),
    rateAllow: async () => true,
    cacheGet: async (c) => cache.get(c) ?? null,
    cachePut: async (c, found, result) => void cache.set(c, { found, result, fetchedAt: "2026-10-04T09:00:00Z" }),
    fetchAnaf: vi.fn(async () => NESTED),
    cuiTaken: async () => false,
    ...over,
  };
}

describe("CUI", () => {
  it("normalizează RO, spații, puncte", () => {
    expect(normalizeCui(" ro 18.547.290 ")).toBe("18547290");
    expect(normalizeCui("1")).toBeNull();
    expect(normalizeCui("12345678901")).toBeNull();
  });
  it("cifra de control", () => {
    expect(isValidCuiChecksum("18547290")).toBe(true);
    expect(isValidCuiChecksum("18547291")).toBe(false);
    expect(validateCui("RO18547290")).toBe("18547290");
  });
  it("CUI invalid nu face apel extern", async () => {
    const d = deps();
    expect((await lookupCompany(d, "18547291")).ok).toBe(false);
    expect(d.fetchAnaf).not.toHaveBeenCalled();
  });
});

describe("parser", () => {
  it("structura v9 cu date_generale", () => {
    const c = parseAnafResponse(NESTED, "18547290")!;
    expect(c).toMatchObject({ legalName: "EXEMPLU IMOBILIARE SRL", tradeRegistryNumber: "J12/100/2006", city: "Cluj-Napoca", county: "Cluj", postalCode: "400002", status: "activa", vatPayer: true });
  });
  it("structura plată, oraș din adresă, inactivă", () => {
    const c = parseAnafResponse(FLAT, "18547290")!;
    expect(c).toMatchObject({ legalName: "FLAT SRL", city: "Iaşi", county: "Iaşi", status: "inactiva", vatPayer: false });
  });
  it("radiată", () => {
    const b = structuredClone(NESTED);
    b.found[0]!.stare_inactiv.dataRadiere = "2020-01-01";
    expect(parseAnafResponse(b, "1")!.status).toBe("radiata");
  });
});

describe("lookupCompany", () => {
  it("negăsit", async () => {
    const r = await lookupCompany(deps({ fetchAnaf: async () => ({ found: [], notFound: [18547290] }) }), "18547290");
    expect(r).toMatchObject({ ok: false, reason: "not_found" });
  });
  it("timeout → unavailable, manual", async () => {
    const r = await lookupCompany(deps({ fetchAnaf: async () => { throw new Error("timeout"); } }), "18547290");
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
  });
  it("cache: al doilea apel nu mai cheamă ANAF", async () => {
    const d = deps();
    await lookupCompany(d, "18547290");
    await lookupCompany(d, "18547290");
    expect(d.fetchAnaf).toHaveBeenCalledTimes(1);
  });
  it("limitare pe IP", async () => {
    const d = deps({ rateAllow: async () => false });
    expect(await lookupCompany(d, "18547290")).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(d.fetchAnaf).not.toHaveBeenCalled();
  });
  it("CUI duplicat", async () => {
    expect(await lookupCompany(deps({ cuiTaken: async () => true }), "18547290")).toMatchObject({ ok: true, alreadyRegistered: true });
  });
});

describe("salvare pe organizație", () => {
  const c = parseAnafResponse(NESTED, "18547290")!;
  const now = new Date("2026-10-04T10:00:00Z");
  it("completează doar câmpurile goale", () => {
    const p = buildOrgSyncPatch({ legal_name: "Editat de mine", city: "", postal_code: null }, c, now);
    expect(p.legal_name).toBeUndefined();
    expect(p).toMatchObject({ city: "Cluj-Napoca", postal_code: "400002", trade_registry_number: "J12/100/2006", company_status: "activa" });
  });
  it("diferențe pentru reîncărcare, fără adresa biroului", () => {
    const d = diffOrgWithCompany({ legal_name: "VECHI SRL", city: "Cluj-Napoca", material_address: "x" }, c);
    expect(d.map((x) => x.field)).toContain("legal_name");
    expect(d.map((x) => x.field)).not.toContain("material_address");
    expect(d.map((x) => x.field)).not.toContain("city");
  });
  it("reîncercare cel mult o dată pe zi", () => {
    expect(shouldSyncOrg({ cui: "18547290" }, now)).toBe(true);
    expect(shouldSyncOrg({ cui: "18547290", company_sync_attempted_at: "2026-10-04T00:00:00Z" }, now)).toBe(false);
    expect(shouldSyncOrg({ cui: "18547290", company_sync_attempted_at: "2026-10-03T09:00:00Z" }, now)).toBe(true);
    expect(shouldSyncOrg({ cui: "18547290", company_verified_at: "2026-10-01" }, now)).toBe(false);
  });
});
