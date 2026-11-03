import { describe, expect, it } from "vitest";
import {
  GDPR_NOTICE_STANDARD_BODY, buildGdprNoticeSnapshot, gdprNoticeForDocument, readGdprNotice,
} from "./gdpr-notice";
import { unknownVariables } from "./templates";

const ORG = "org-1";
const standard = { id: "std", kind: "gdpr_notice", organization_id: null, is_active: true, body: GDPR_NOTICE_STANDARD_BODY };
const vars = {
  "contract.data": "03.11.2026", "agentie.denumire_legala": "Agenția Test SRL", "agentie.cui": "RO123",
  "agentie.registru": "J40/1/2020", "agentie.adresa": "Str. Exemplu 1, București",
  "agentie.email": "office@test.ro", "agentie.telefon": "0700000000",
  "client.cnp": "1900101400011", "client.serie": "RX", "client.numar": "123456",
};
const withCnp = [{ role: "agent" }, { role: "client", cnp: "1900101400011", idSeries: "RX", idNumber: "123456" }];
const snap = (kind: string, parties = withCnp, templates = [standard]) =>
  buildGdprNoticeSnapshot({ kind, parties, templates, orgId: ORG, vars });
const attached = (kind: string, parties = withCnp) => {
  const s = snap(kind, parties);
  return gdprNoticeForDocument({ kind, data: s ? { gdprNotice: s } : {}, parties, signingStarted: false });
};

describe("C7 notă GDPR", () => {
  it.each(["commission", "viewing", "exclusive_representation"])("se anexează la %s cu CNP, cu datele agenției", (kind) => {
    const body = attached(kind);
    expect(body).toContain("Agenția Test SRL, CUI RO123");
    expect(body).toContain("office@test.ro");
  });
  it.each(["rent_agreement", "loan_for_use"])("nu se anexează la %s nici cu CNP", (kind) => {
    expect(snap(kind)).toBeNull();
    expect(attached(kind)).toBeNull();
  });
  it("fără date din act nu se anexează", () => {
    const parties = [{ role: "agent", cnp: "1900101400011" }, { role: "client" }];
    expect(snap("commission", parties)?.attached).toBe(false);
    expect(attached("commission", parties)).toBeNull();
  });
  it("folosește textul agenției când există", () => {
    const own = { ...standard, id: "own", organization_id: ORG, body: "NOTA AGENTIEI {{agentie.denumire_legala}}" };
    const s = snap("commission", withCnp, [standard, own]);
    expect(s?.templateId).toBe("own");
    expect(s?.body).toBe("NOTA AGENTIEI Agenția Test SRL");
  });
  it("textul standard nu are variabile necunoscute", () => {
    expect(unknownVariables(GDPR_NOTICE_STANDARD_BODY)).toEqual([]);
  });
  it("nota nu conține CNP-ul, seria sau numărul, nici cerute de șablon", () => {
    const own = { ...standard, id: "own", organization_id: ORG, body: "{{client.cnp}} {{client.serie}} {{client.numar}} X" };
    for (const s of [snap("viewing"), snap("viewing", withCnp, [own])]) {
      expect(s?.body).not.toContain("1900101400011");
      expect(s?.body).not.toContain("RX");
      expect(s?.body).not.toContain("123456");
    }
  });
  it("textul salvat nu se schimbă după editarea șablonului", () => {
    const template = { ...standard };
    const data = { gdprNotice: buildGdprNoticeSnapshot({ kind: "commission", parties: withCnp, templates: [template], orgId: ORG, vars }) };
    const before = readGdprNotice(data)?.body;
    template.body = "TEXT NOU";
    expect(readGdprNotice(data)?.body).toBe(before);
    expect(gdprNoticeForDocument({ kind: "commission", data, parties: withCnp, signingStarted: true })).toBe(before);
  });
});
