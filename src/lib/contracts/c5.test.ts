import { describe, expect, it } from "vitest";
import { STANDARD_CONTRACT_TEMPLATES } from "./standard-templates";
import { renderTemplate, unknownVariables } from "./templates";
import { buildC5Request, C5_KINDS, defaultC5Form, type C5Kind } from "./c5";
import { contractTemplateVars, mergeStoredIdentity } from "./template-vars";
import { printedContractNumber } from "./numbering";
import { contractBodyBlocks } from "./viewing-table";

const person = (name: string, role = "client") => ({
  role: role as never, fullName: name, cnp: "1800101123456", docType: "ci", idSeries: "RX", idNumber: "123456",
  idIssuer: "SPCLEP Sector 1", idIssuedOn: "01.01.2020", address: "Str. Exemplu 1, București", phone: "0700000000",
  email: "", citizenship: "română",
});
const agent = { ...person("Agent Test", "agent") };
const org = { name: "Agenție Test", legal_name: "Agenție Test SRL", cui: "RO1", trade_registry_number: "J40/1/2020",
  material_address: "Str. Sediu 2", phone: "0711", email: "a@test.ro", legal_representative: "Ion Admin" };
const property = { title: "Ap. 2 camere", reference: "HB-100", address: "Str. Imobil 3", city: "București", county: "Ilfov",
  surface: 50, rooms: 2, price: 100000, property_type: "apartment" };
const viewing = [
  { reference: "HB-100", address: "Strada A nr. 1", price: 150000, currency: "EUR" },
  { reference: "HB-200", address: "Strada B nr. 2", price: 500, currency: "EUR" },
];

function form(kind: C5Kind) {
  return { ...defaultC5Form("București"), commission: "3% + TVA din prețul de vânzare", startDate: "01.12.2026",
    landBook: "123456", cadastralNumber: "654321", propertyAddress: "Str. Imobil 3, București",
    viewingPropertyIds: kind === "viewing" ? ["a", "b"] : [] };
}
function render(kind: C5Kind) {
  const request = buildC5Request(kind, form(kind), { client: person("Client Test"), lender: person("Comodant Test"), borrower: person("Comodatar Test") }, agent);
  const parties = request.parties;
  const client = parties.find((p) => p.role !== "agent") ?? parties[0]!;
  const vars = contractTemplateVars({ kind, org, profile: { full_name: "Agent Test", phone: "0722", email: "ag@test.ro" }, property,
    client, parties, price: 100000, currency: "EUR", commission: request.commission ?? null, fields: request.fields,
    viewingProperties: kind === "viewing" ? viewing : [] });
  const body = STANDARD_CONTRACT_TEMPLATES.find((t) => t.kind === kind)!.body;
  // Numărul tipărit e pus de trigger la inserare (C2/C3).
  const rendered = renderTemplate(body, vars).replaceAll("{{contract.serie_numar}}", printedContractNumber(kind === "loan_for_use" ? null : "CM", kind === "loan_for_use" ? null : 150));
  return { request, rendered, body };
}

describe("C5 new contract kinds", () => {
  for (const kind of C5_KINDS) {
    it(`${kind}: correct roles and every template field filled`, () => {
      const { request, rendered, body } = render(kind);
      expect(unknownVariables(body)).toEqual([]);
      expect(request.parties.map((p) => p.role)).toEqual(
        kind === "loan_for_use" ? ["lender", "borrower"] : ["agent", "client"]);
      expect(rendered).not.toContain("{{");
      expect(rendered).not.toContain("__________");
    });
  }
  it("commission defaults: 6 months, 12 protection months, 2 copies", () => {
    expect(render("commission").request.fields).toMatchObject({ durationMonths: 6, protectionMonths: 12, copies: 2, locality: "București" });
  });
  it("loan for use has no printed number and supports indefinite duration", () => {
    const { rendered } = render("loan_for_use");
    expect(rendered.startsWith("CONTRACT DE COMODAT\nîncheiat astăzi")).toBe(true);
    const r = buildC5Request("loan_for_use", { ...form("loan_for_use"), loanIndefinite: true }, { lender: person("Comodant Test"), borrower: person("Comodatar Test") }, agent);
    expect(r.fields).toMatchObject({ durationText: "pe durată nedeterminată" });
  });
  it("viewing with 2 properties renders a table with both, and requires at least one", () => {
    const { rendered, request } = render("viewing");
    expect(request.viewingPropertyIds).toEqual(["a", "b"]);
    expect(contractBodyBlocks(rendered).find((b) => b.type === "table")).toEqual({ type: "table", rows: [
      ["Referință", "Adresă", "Preț"], ["HB-100", "Strada A nr. 1", "150.000 EUR"], ["HB-200", "Strada B nr. 2", "500 EUR"]] });
    expect(() => buildC5Request("viewing", { ...form("viewing"), viewingPropertyIds: [] }, { client: person("Client Test") }, agent)).toThrow(/cel puțin un imobil/);
  });
  it("fills the party from contact_identities unless scanned in the dialog", () => {
    const stored = { fullName: "Popescu Ion", cnp: "1800101123456", idSeries: "RX", idNumber: "999999", address: "Str. Fișă 9", docType: "cei", citizenship: undefined };
    const merged = mergeStoredIdentity({ role: "client", fullName: "Ion P", phone: "0700", citizenship: "română", saveIdentity: false }, stored);
    expect(merged).toMatchObject({ fullName: "Popescu Ion", cnp: "1800101123456", idNumber: "999999", address: "Str. Fișă 9", docType: "cei", phone: "0700", citizenship: "română" });
    const scanned = { role: "client", fullName: "Scanat Nou", cnp: "2900101123456", saveIdentity: true };
    expect(mergeStoredIdentity(scanned, stored)).toEqual(scanned);
  });
});
