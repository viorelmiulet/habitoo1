import { describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { filterCommissionRows, type CommissionRecord } from "./commissions-data";
import { commissionCsv, commissionExportMatrix, commissionFilename, commissionXlsx } from "./commissions-export";
import { buildCommissionPdf } from "./commissions-pdf";
import { reportKpis, convertCommissionAmount, monthlySeries, breakdownBy } from "./commissions-reports";
import { emptyCommissionForm } from "./commissions";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("./commissions-rates.functions", () => ({ ensureCommissionRates: vi.fn() }));
const row = (over: Partial<CommissionRecord> = {}): CommissionRecord => ({ id:"c1",organization_id:"org1",agent_id:"a1",created_by:"a1",allocated_by_admin:false,transaction_date:"2026-10-10",transaction_kind:"sale",property_type:"apartment",property_id:null,contact_id:null,location_text:"Titan",transaction_value:100000,agency_commission:1000,agent_amount:400,currency:"EUR",payer:"buyer",status:"collected",collected_at:"2026-10-10",notes:"Notă completă",created_at:"2026-10-10T12:00:00Z",updated_at:"2026-10-10T12:00:00Z",ron_to_eur_rate:5,...over });
const filters={from:"2026-10-01",to:"2026-10-31",agent:"__all",kind:"sale",ptype:"apartment",status:"__all"};
const scope={orgId:"org1",userId:"a1",isAdmin:false};
const names={agents:new Map([["a1","Agent unu"]]),properties:new Map<string,string>(),contacts:new Map<string,string>()};
const rows=[row(),row({id:"c2",currency:"RON",agency_commission:5100,agent_amount:2040,ron_to_eur_rate:5.1}),row({id:"cancel",status:"cancelled",agency_commission:99999})];

describe("export și moneda",()=>{
  it("exportă exact filtrul curent și totaluri fără anulate",()=>{
    const selected=filterCommissionRows([...rows,row({id:"old",transaction_date:"2026-09-01"}),row({id:"rent",transaction_kind:"rent"}),row({id:"house",property_type:"house"})],filters,scope);
    expect(selected.map(r=>r.id)).toEqual(["c1","c2","cancel"]);
    const matrix=commissionExportMatrix(selected,names,"EUR");
    expect(matrix.values).toHaveLength(3);expect(matrix.headers).toHaveLength(31);
    expect(matrix.totals[26]).toBe(2000);expect(matrix.totals[27]).toBe(800);
    expect(matrix.values[1][24]).toBe(5.1);
    expect(commissionCsv(matrix)).toContain("Notă completă");
    expect(filterCommissionRows(rows,{...filters,status:"collected"},scope)).toHaveLength(2);
  });
  it("agentul nu exportă alt agent sau altă agenție, nici cu filtru falsificat",()=>{
    const all=[row(),row({id:"other",agent_id:"a2"}),row({id:"outside",organization_id:"org2"})];
    expect(filterCommissionRows(all,{...filters,agent:"a2"},scope).map(r=>r.id)).toEqual(["c1"]);
    expect(filterCommissionRows(all,{...filters,agent:"a2"},{...scope,isAdmin:true}).map(r=>r.id)).toEqual(["other"]);
  });
  it("EUR/RON folosește cursul fiecărui comision",()=>{
    expect(convertCommissionAmount(1000,"EUR","RON",5)).toBe(5000);
    expect(convertCommissionAmount(5100,"RON","EUR",5.1)).toBeCloseTo(1000,8);
    expect(reportKpis(rows,"EUR").agencyEur).toBe(2000);
    expect(reportKpis(rows,"RON").agencyEur).toBe(10100);
    expect(reportKpis(rows,"RON").agentEur).toBe(4040);
    expect(monthlySeries(rows,filters,"RON")[0].current).toBe(10100);
    expect(breakdownBy(rows,"agent_id","RON")[0].value).toBe(10100);
  });
  it("formular nou EUR",()=>expect(emptyCommissionForm("a1").currency).toBe("EUR"));
  it("PDF agent fără clasament sau tabel al altor agenți",async()=>{
    const k=reportKpis([row()]);
    const blob=await buildCommissionPdf({agency:"MVA Imobiliare",range:filters,generatedAt:"25.10.2026",currency:"RON",filter:"Comisioanele tale",current:k,previous:k,lastYear:k,series:[],byKind:[],byType:[]});
    await writeFile("/tmp/commissions-agent.pdf",new Uint8Array(await blob.arrayBuffer()));
    expect((await PDFDocument.load(await blob.arrayBuffer())).getPageCount()).toBeGreaterThan(0);
  });
  it("Excel conține rândurile, cursurile și formule cu totaluri corecte",async()=>{
    const blob=await commissionXlsx(rows,names,"RON");
    const {default:ExcelJS}=await import("exceljs");const book=new ExcelJS.Workbook();
    const bytes=new Uint8Array(await blob.arrayBuffer());
    await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
    const sheet=book.getWorksheet("Comisioane");expect(sheet?.rowCount).toBe(5);
    expect(sheet?.getCell("Y3").value).toBe(5.1);
    expect(sheet?.getCell("AD5").value).toMatchObject({result:10100});
    expect(sheet?.getCell("AA5").value).toMatchObject({result:2000});
    await writeFile("/tmp/commissions-qa.xlsx",bytes);
    expect(commissionFilename(filters,"MVA-Imobiliare","xlsx")).toBe("comisioane_2026-10_MVA-Imobiliare.xlsx");
  });
  for(const range of [{from:"2026-10-01",to:"2026-10-31"},{from:"2026-09-15",to:"2026-10-25"}]){
    it(`PDF pentru ${range.from} — ${range.to}`,async()=>{
      const k=reportKpis(rows);const blob=await buildCommissionPdf({agency:"MVA Imobiliare",range,generatedAt:"25.10.2026, 18:33",currency:"EUR",filter:"Toți agenții",current:k,previous:reportKpis([]),lastYear:reportKpis([]),series:monthlySeries(rows,range),byKind:[{name:"Vânzare",value:2000,count:2}],byType:[{name:"Apartament",value:2000,count:2}],agents:[{name:"Agent unu",value:2000,count:2,agentAmount:800}]});
      const bytes=new Uint8Array(await blob.arrayBuffer());const doc=await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBeGreaterThan(0);expect(doc.getTitle()).toContain(range.from);
      expect(bytes.length).toBeGreaterThan(5000);
      await writeFile(`/tmp/commissions-${range.from}.pdf`,bytes);
    });
  }
});