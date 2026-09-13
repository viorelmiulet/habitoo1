/**
 * Parser CSV conform RFC 4180: ghilimele duble, câmpuri cu virgulă sau
 * newline, BOM, CRLF. Determinist și fără dependențe externe.
 */

export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

/** Detectează separatorul folosit în prima linie: virgulă, punct și virgulă sau tab. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char in counts) counts[char] = (counts[char] ?? 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ",";
}

/** Împarte textul CSV în matrice de câmpuri. */
export function parseCsvRows(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const sep = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === sep) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char === "\r") continue;
    field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Parsează CSV cu prima linie ca antet, returnând obiecte cheie → valoare. */
export function parseCsv(text: string, delimiter?: string): CsvParseResult {
  const rows = parseCsvRows(text, delimiter);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (const row of rows.slice(1)) {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = (row[index] ?? "").trim();
    });
    out.push(record);
  }
  return { headers, rows: out };
}
