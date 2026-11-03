import { expect, it } from "vitest";
import { STANDARD_CONTRACT_TEMPLATES } from "./standard-templates";
import { renderTemplate, unknownVariables } from "./templates";
import { contractBodyBlocks, viewingTable } from "./viewing-table";
import { printedContractNumber } from "./numbering";
import { buildContractPdf } from "./pdf.server";
import { PDFDocument } from "pdf-lib";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

for (const template of STANDARD_CONTRACT_TEMPLATES) {
  it(`knows every variable in the ${template.kind} standard template`, () => {
    expect(unknownVariables(template.body)).toEqual([]);
  });
}
it("viewing table contains the two selected properties in selection order and generates PDF", async () => {
  const table = viewingTable([
    { reference: "HB-100", address: "Strada A nr. 1", price: 150000, currency: "EUR" },
    { reference: "HB-200", address: "Strada B nr. 2", price: 500, currency: "EUR" },
  ]);
  const body = renderTemplate("Imobile vizionate\n{{vizionare.tabel}}", { "vizionare.tabel": table });
  const blocks = contractBodyBlocks(body);
  expect(blocks.find((b) => b.type === "table")).toEqual({ type: "table", rows: [
    ["Referință", "Adresă", "Preț"], ["HB-100", "Strada A nr. 1", "150.000 EUR"], ["HB-200", "Strada B nr. 2", "500 EUR"],
  ] });
  const bytes = await buildContractPdf({ title: "Contract de vizionare", body, agency: { name: "Agenție test" }, parties: [] });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(2);
});
it("combined printed number is CM 150, number 1 without series, and empty for loan for use in the real trigger", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE contracts(kind text,doc_series text,doc_number integer,body text,data jsonb);");
    await db.exec(readFileSync("drizzle/migrations/0234_contracts_c3_combined_printed_number.sql","utf8"));
    const result = await db.query<{ body: string }>(`INSERT INTO contracts(kind,doc_series,doc_number,body) VALUES
      ('commission','CM',150,'{{contract.serie_numar}}'),('viewing','',1,'{{contract.serie_numar}}'),('loan_for_use',NULL,NULL,'{{contract.serie_numar}}') RETURNING body`);
    expect(result.rows.map((row) => row.body)).toEqual(["seria CM nr. 150", "nr. 1", ""]);
    expect([printedContractNumber("CM",150),printedContractNumber("",1),printedContractNumber(null,null)]).toEqual(["seria CM nr. 150","nr. 1",""]);
    expect(renderTemplate("{{contract.serie_numar}}", {"contract.serie_numar":""})).toBe("");
  } finally { await db.close(); }
});