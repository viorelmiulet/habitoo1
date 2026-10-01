import { describe, expect, it } from "vitest";
import { idsWithAgentPhone, resolveListingContact } from "./listing-contact";
import { mapPropertyToStoria } from "./storia/mapper";
import { mapPropertyToImospot } from "./imospot/mapper";
import { mapPropertyToHomePitch } from "./homepitch/mapper";
import { mapPropertyToImove } from "./imove/mapper";

const AGENCY_PHONE = "0311111111";
const agent = { full_name: "Ana Popescu", email: "ana@test.ro", phone: "0722333444" };
const noPhone = { ...agent, phone: null };

describe("resolveListingContact", () => {
  it("întoarce datele agentului responsabil", () => {
    const r = resolveListingContact({ assignedTo: "a1", agent: { ...agent, avatar_url: "https://x/y.jpg" } });
    expect(r).toEqual({ ok: true, contact: { name: "Ana Popescu", phone: "0722333444", email: "ana@test.ro", photoUrl: "https://x/y.jpg" } });
  });
  it("eroare clară fără agent", () => {
    const r = resolveListingContact({ assignedTo: null, agent: null });
    expect(r.ok === false && r.message).toBe("Anunțul nu are agent responsabil.");
  });
  it("eroare clară fără telefon valid", () => {
    const r = resolveListingContact({ assignedTo: "a1", agent: { ...agent, phone: "0212" } });
    expect(r.ok === false && r.message).toBe("Agentul Ana Popescu nu are telefon în profil. Completează-l în Echipă / Profil.");
  });
  it("feedurile ClickImob/Imove păstrează doar ofertele cu telefon de agent", () => {
    const ids = idsWithAgentPhone(
      [{ id: "p1", assigned_to: "a1" }, { id: "p2", assigned_to: "a2" }, { id: "p3", assigned_to: null }],
      [{ id: "a1", ...agent }, { id: "a2", ...noPhone }],
    );
    expect(ids).toEqual(["p1"]);
  });
});

describe("mapperii nu folosesc telefonul agenției", () => {
  const p = {
    id: "p1", reference: "HB-1", title: "Apartament", description: "Descriere", price: 100000, currency: "EUR",
    transaction_kind: "sale", for_sale: true, property_type: "apartment", city: "Cluj", county: "Cluj", assigned_to: "a1",
  } as never;
  it("Storia: fără telefon, publicarea se blochează; contactul e mereu al agentului", () => {
    const blocked = mapPropertyToStoria(p, { baseUrl: "https://crm.habitoo.ro", agent: noPhone });
    expect(blocked.ok).toBe(false);
    expect(JSON.stringify(blocked)).not.toContain(AGENCY_PHONE);
  });
  it("Imospot: fără telefon de agent, blocat", () => {
    const r = mapPropertyToImospot(p, { baseUrl: "https://crm.habitoo.ro", agent: noPhone });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toContain("nu are telefon în profil");
  });
  it("Homepitch: fără telefon de agent, blocat", () => {
    const r = mapPropertyToHomePitch(p, { baseUrl: "https://crm.habitoo.ro", agent: noPhone } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toContain("nu are telefon în profil");
  });
  it("Imove: oferta e exclusă din feed cu motiv", () => {
    const r = mapPropertyToImove(p, { baseUrl: "https://crm.habitoo.ro", agent: noPhone });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain("Exclus din feed: agentul nu are telefon.");
    const ok = mapPropertyToImove(p, { baseUrl: "https://crm.habitoo.ro", agent });
    expect(ok.ok && ok.listing.agentPhone).toBe("0722333444");
  });
});
