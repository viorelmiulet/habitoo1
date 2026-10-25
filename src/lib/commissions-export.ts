import { convertCommissionAmount, type DisplayCurrency, type ReportRange } from "./commissions-reports";
import type { CommissionRecord } from "./commissions-data";
import { commissionPayerLabels, commissionStatusLabels } from "./commissions";
import { propertyTypeLabels, transactionLabels } from "./labels";

export function commissionFilename(range: ReportRange, agency: string, ext: string) {
  const period = range.from && range.to ? (/^\d{4}-\d{2}-01$/.test(range.from) && new Date(`${range.to}T00:00:00Z`).getUTCDate() === new Date(Date.UTC(Number(range.to.slice(0,4)), Number(range.to.slice(5,7)), 0)).getUTCDate() && range.from.slice(0,7) === range.to.slice(0,7) ? range.from.slice(0,7) : `${range.from}_${range.to}`) : range.from || range.to || "toate";
  const name = agency.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "Agentie";
  return `comisioane_${period}_${name}.${ext}`;
}

export const exportHeaders = ["ID", "ID agenție", "ID agent", "Agent", "Creat de", "Alocat de admin", "Data tranzacției", "Tranzacție", "Tip proprietate", "ID proprietate", "Proprietate", "ID client", "Client", "Adresă / zonă", "Valoarea tranzacției (original)", "Comision agenție (original)", "Suma agentului (original)", "Moneda originală", "Plătitor", "Stare", "Data încasării", "Note", "Creat la", "Actualizat la", "Curs (RON / EUR)", "Sursa cursului", "Valoarea tranzacției (EUR)", "Comision agenție (EUR)", "Suma agentului (EUR)"];
export type ExportNames = { agents: Map<string,string>; properties: Map<string,string>; contacts: Map<string,string> };
export function commissionExportMatrix(rows: CommissionRecord[], names: ExportNames, currency: DisplayCurrency) {
  const headers = [...exportHeaders, `Valoarea tranzacției (${currency}, afișare)`, `Comision agenție (${currency}, afișare)`, `Suma agentului (${currency}, afișare)`];
  const values = rows.map(r => [r.id, r.organization_id, r.agent_id, names.agents.get(r.agent_id) ?? r.agent_id, r.created_by, r.allocated_by_admin ? "Da" : "Nu", r.transaction_date,
    transactionLabels[r.transaction_kind] ?? r.transaction_kind, propertyTypeLabels[r.property_type] ?? r.property_type, r.property_id ?? "", names.properties.get(r.property_id ?? "") ?? "", r.contact_id ?? "", names.contacts.get(r.contact_id ?? "") ?? "", r.location_text ?? "", Number(r.transaction_value), Number(r.agency_commission), Number(r.agent_amount), r.currency, commissionPayerLabels[r.payer] ?? r.payer, commissionStatusLabels[r.status] ?? r.status, r.collected_at ?? "", r.notes ?? "", r.created_at, r.updated_at, r.ron_to_eur_rate ?? "", r.ron_to_eur_rate ? (r.rate_source ?? "BNR") : "",
    ...["EUR", currency].flatMap(target => [r.transaction_value, r.agency_commission, r.agent_amount].map(v => r.currency !== target && !r.ron_to_eur_rate ? "" : convertCommissionAmount(Number(v), r.currency, target as DisplayCurrency, r.ron_to_eur_rate))) ]);
  const totals: (string | number)[] = headers.map(() => "");
  totals[0] = "TOTAL (fără anulate)";
  for (const col of [26,27,28,29,30,31]) totals[col] = values.reduce((sum, row, i) => rows[i].status === "cancelled" ? sum : sum + Number(row[col] || 0), 0);
  return { headers, values, totals };
}

/** Quote all text and neutralize spreadsheet formula injection without changing numbers. */
export function commissionCsv(matrix: ReturnType<typeof commissionExportMatrix>) {
  const cell = (v: string | number) => typeof v === "number" ? String(v) : `"${(/^[\s]*[=+@-]/.test(v) ? "'" + v : v).replace(/"/g, '""')}"`;
  return "\uFEFF" + [matrix.headers, ...matrix.values, matrix.totals].map(row => row.map(cell).join(",")).join("\r\n");
}

export async function commissionXlsx(rows: CommissionRecord[], names: ExportNames, currency: DisplayCurrency) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Comisioane", { views: [{ state: "frozen", ySplit: 1 }] });
  const matrix = commissionExportMatrix(rows, names, currency);
  sheet.addRow(matrix.headers);
  matrix.values.forEach(v => sheet.addRow(v));
  sheet.addRow(matrix.totals);
  sheet.columns.forEach((col, i) => { col.width = [3,10,12,13,21].includes(i) ? 34 : 22; });
  sheet.eachRow((row, n) => {
    row.font = { name: "Arial", size: 10, bold: n === 1 || n === rows.length + 2 };
    row.alignment = { vertical: "top", wrapText: true };
    if (n === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4EAE7" } };
  });
  sheet.autoFilter = { from: "A1", to: `AF${Math.max(1, rows.length + 1)}` };
  const numericCols = [15,16,17,25,27,28,29,30,31,32];
  for (let i = 0; i < rows.length; i++) {
    const n = i + 2;
    const row = rows[i];
    for (const c of numericCols) sheet.getCell(n,c).numFmt = c === 25 ? '0.000000' : '#,##0.00;(#,##0.00);"-"';
    for (const [start, target] of [[27,"EUR"], [30,currency]] as const) {
      for (let k = 0; k < 3; k++) {
        const original = String.fromCharCode(79 + k);
        const formula = `IF(R${n}="${target}",${original}${n},IF(AND(ISNUMBER(Y${n}),Y${n}>0),${original}${n}${target === "EUR" ? "/" : "*"}Y${n},""))`;
        sheet.getCell(n,start+k).value = { formula, result: matrix.values[i][start+k-1] };
      }
    }
  }
  for (const col of [27,28,29,30,31,32]) {
    const letter = sheet.getColumn(col).letter;
    sheet.getCell(rows.length+2,col).value = { formula: rows.length ? `SUMIF(T2:T${rows.length+1},"<>Anulat",${letter}2:${letter}${rows.length+1})` : "0", result: matrix.totals[col-1] };
    sheet.getCell(rows.length+2,col).numFmt = '#,##0.00;(#,##0.00);"-"';
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}