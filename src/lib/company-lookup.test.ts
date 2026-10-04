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

import { buildSeatAddress, normalizePostalCode } from "./company-lookup";
import { syncOrgFromAnaf } from "./company-lookup.server";

const BUC = {
  found: [{
    date_generale: { denumire: "EXPERT TEST S.R.L.", adresa: "MUNICIPIUL BUCUREŞTI, SECTOR 1, STR. X, NR.4", nrRegCom: "J40/1/2019", codPostal: "14584", stare_inregistrare: "INREGISTRAT" },
    stare_inactiv: { statusInactivi: false },
    adresa_sediu_social: { sdenumire_Localitate: "Sector 1 Mun. Bucureşti", sdenumire_Strada: "Str. Lămâiului", snumar_Strada: "4", sdetalii_Adresa: "CAMERA NR. 2", sdenumire_Judet: "MUNICIPIUL BUCUREŞTI", scod_Postal: "14584" },
  }],
};

function fakeDb(org: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  const chain = (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...org } }) }) }),
    update: (p: Record<string, unknown>) => ({ eq: async () => { if (table === "organizations") { updates.push(p); Object.assign(org, p); } return { error: null }; } }),
    insert: async () => ({ error: null }),
  });
  return { db: { from: chain } as never, updates, org };
}
const sdeps = (fetchAnaf: () => Promise<unknown>) => ({
  now: () => new Date("2026-10-04T10:00:00Z"), cacheGet: async () => null, cachePut: async () => {}, fetchAnaf,
});

describe("ANAF la crearea organizației", () => {
  it("cod poștal cu zero în față", () => {
    expect(normalizePostalCode("14584")).toBe("014584");
    expect(normalizePostalCode("400002")).toBe("400002");
    expect(normalizePostalCode("")).toBeNull();
  });
  it("sediul social București: oraș București, sectorul în adresă", () => {
    const c = parseAnafResponse(BUC, "40930967")!;
    expect(c).toMatchObject({ city: "București", county: "București", postalCode: "014584" });
    expect(c.address).toBe("Sector 1, Str. Lămâiului, nr. 4, CAMERA NR. 2");
    expect(buildSeatAddress({})).toBeNull();
  });
  it("completare la creare: doar câmpurile goale, marcat verificat", async () => {
    const f = fakeDb({ id: "o1", cui: "40930967", legal_name: "EDITAT", material_address: null, city: null });
    const r = await syncOrgFromAnaf(f.db, "o1", null, sdeps(async () => BUC));
    expect(r.status).toBe("verified");
    expect(f.org).toMatchObject({ legal_name: "EDITAT", city: "București", county: "București", postal_code: "014584", registered_address: "Sector 1, Str. Lămâiului, nr. 4, CAMERA NR. 2", material_address: "Sector 1, Str. Lămâiului, nr. 4, CAMERA NR. 2", company_status: "activa" });
    expect(f.org.company_verified_at).toBeTruthy();
  });
  it("ANAF indisponibil → neverificat, câmpurile rămân de completat manual", async () => {
    const f = fakeDb({ id: "o1", cui: "40930967", city: null });
    const r = await syncOrgFromAnaf(f.db, "o1", null, sdeps(async () => { throw new Error("timeout"); }));
    expect(r.status).toBe("unverified");
    expect(f.org.city).toBeNull();
    expect(f.org.company_verified_at).toBeUndefined();
    expect(f.org.company_sync_attempted_at).toBeTruthy();
  });
  it("câmp parțial gol în ANAF → doar acela rămâne de cerut", async () => {
    const b = structuredClone(BUC);
    (b.found[0]!.adresa_sediu_social as Record<string, string>).scod_Postal = "";
    b.found[0]!.date_generale.codPostal = "";
    const f = fakeDb({ id: "o1", cui: "40930967" });
    await syncOrgFromAnaf(f.db, "o1", null, sdeps(async () => b));
    expect(f.org.city).toBe("București");
    expect(f.org.postal_code).toBeUndefined();
  });
});
