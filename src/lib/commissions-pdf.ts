import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CONTRACT_FONT_REGULAR_B64, CONTRACT_FONT_BOLD_B64 } from "./contracts/fonts";
import { compareValue, type ReportKpis, type MonthlyPoint, type ReportRange, type DisplayCurrency } from "./commissions-reports";

export type CommissionPdfModel = {
  agency: string; range: ReportRange; generatedAt: string; currency: DisplayCurrency; filter: string;
  current: ReportKpis; previous: ReportKpis; lastYear: ReportKpis;
  series: MonthlyPoint[]; byKind: {name:string;value:number;count:number}[]; byType: {name:string;value:number;count:number}[];
  agents?: {name:string;value:number;count:number;agentAmount:number}[];
};
export async function buildCommissionPdf(model: CommissionPdfModel): Promise<Blob> {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const decode = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const regular = await doc.embedFont(decode(CONTRACT_FONT_REGULAR_B64), { subset: true });
  const bold = await doc.embedFont(decode(CONTRACT_FONT_BOLD_B64), { subset: true });
  const ink = rgb(.12,.17,.15), accent = rgb(.15,.43,.32), comparison = rgb(.57,.65,.62);
  let page = doc.addPage([595.28,841.89]), y = 790;
  const ensure = (height: number) => { if (y-height < 50) { page = doc.addPage([595.28,841.89]); y = 790; } };
  const text = (value: string, size=10, strong=false) => {
    const font = strong ? bold : regular;
    const lines: string[] = []; let line="";
    for (const word of value.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next,size)>495 && line) { lines.push(line); line=word; } else line=next;
    }
    lines.push(line);
    for (const part of lines) { ensure(size+9); page.drawText(part,{x:50,y:y-size,size,font,color:ink}); y-=size+9; }
  };
  const money = (n:number) => new Intl.NumberFormat("ro-RO", {maximumFractionDigits:2}).format(n) + ` ${model.currency}`;
  text(model.agency,20,true); text("Raport comisioane",15,true);
  text(`${model.range.from} — ${model.range.to} · ${model.currency}`);
  text(`Generat: ${model.generatedAt}`); if (model.filter) text(model.filter);
  text("Conversie: cursul RON/EUR salvat pe fiecare comision (sursa: BNR sau BCE).",9);
  y-=12;
  const keys: [keyof ReportKpis,string][] = [["agencyEur","Comision agenție"],["agentEur","Suma agenților"],["count","Tranzacții"],["avgEur","Comision mediu / tranzacție"],["collectedEur","Încasat"],["pendingEur","De încasat"]];
  for (const [key,label] of keys) {
    ensure(64); const fmt = key==="count" ? (n:number)=>String(n) : money;
    text(`${label}: ${fmt(model.current[key])}`,11,true);
    for (const [name,kpis] of [["Perioada anterioară",model.previous],["Anul trecut",model.lastYear]] as const) {
      const c=compareValue(model.current[key],kpis[key]);
      text(`${name}: ${c.pct===null ? "—" : `${c.pct>=0?"+":""}${c.pct.toFixed(1)}%`} · ${c.diff>=0?"+":""}${fmt(c.diff)}`,9);
    }
    y-=6;
  }
  ensure(80); text("Evoluția pe luni",13,true); text("Perioada aleasă / Anul trecut",9);
  const max=Math.max(1,...model.series.flatMap(p=>[p.current,p.lastYear]));
  for (const point of model.series) {
    ensure(50); text(`${point.month}: ${money(point.current)} / ${money(point.lastYear)}`,9);
    for (const [v,color] of [[point.current,accent],[point.lastYear,comparison]] as const) {
      page.drawRectangle({x:50,y:y-8,width:Math.max(0,v/max*495),height:7,color}); y-=11;
    }
    y-=6;
  }
  const breakdown=(title:string,rows:{name:string;value:number;count:number}[])=> {
    ensure(90); y-=12; text(title,13,true); const maxValue=Math.max(1,...rows.map(r=>r.value));
    if (!rows.length) text("—");
    for (const r of rows) { ensure(44); text(`${r.name} · ${r.count} tranzacții · ${money(r.value)}`,10); page.drawRectangle({x:50,y:y-7,width:Math.max(0,r.value/maxValue*495),height:7,color:accent}); y-=20; }
  };
  breakdown("Pe tip tranzacție",model.byKind); breakdown("Pe tip proprietate",model.byType);
  if(model.agents) {
    breakdown("Clasament agenți",model.agents);
    ensure(70); y-=12; text("Tabel pe agenți",13,true);
    text("Agent · Tranzacții · Comision agenție · Suma agentului",9,true);
    for(const agent of model.agents) text(`${agent.name} · ${agent.count} · ${money(agent.value)} · ${money(agent.agentAmount)}`,10);
  }
  doc.getPages().forEach((p,i)=>p.drawText(`Habitoo · ${i+1} / ${doc.getPageCount()}`,{x:50,y:25,size:8,font:regular,color:ink}));
  doc.setTitle(`Comisioane — ${model.agency} — ${model.range.from} / ${model.range.to}`);
  return new Blob([new Uint8Array(await doc.save())],{type:"application/pdf"});
}