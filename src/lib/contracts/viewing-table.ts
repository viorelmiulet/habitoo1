export type ViewingProperty = { reference: string | null; address: string | null; price: number | null; currency: string | null };
export type ContractBodyBlock = { type: "text"; text: string } | { type: "table"; rows: string[][] };
const cell = (value: string | null) => (value ?? "__________").replace(/[|\r\n]/g, " ");

/** Plain-text, editable table representation, never HTML. */
export function viewingTable(properties: ViewingProperty[]): string {
  return ["| Referință | Adresă | Preț |", "| --- | --- | --- |", ...properties.map((p) =>
    `| ${cell(p.reference)} | ${cell(p.address)} | ${p.price == null ? "__________" : `${p.price.toLocaleString("ro-RO")} ${cell(p.currency)}`} |`)].join("\n");
}

/** Shared safe parser for the preview and PDF; no raw HTML is rendered. */
export function contractBodyBlocks(body: string): ContractBodyBlock[] {
  const lines = body.split(/\r?\n/);
  const blocks: ContractBodyBlock[] = [];
  let text: string[] = [];
  const flush = () => { if (text.length) { blocks.push({ type: "text", text: text.join("\n") }); text = []; } };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "| Referință | Adresă | Preț |" && lines[i + 1]?.trim() === "| --- | --- | --- |") {
      flush(); i += 1;
      const rows: string[][] = [["Referință", "Adresă", "Preț"]];
      while (lines[i + 1]?.trim().startsWith("|")) {
        const cells = (lines[i + 1] ?? "").trim().split("|").slice(1, -1).map((v) => v.trim());
        if (cells.length !== 3) break;
        rows.push(cells); i += 1;
      }
      blocks.push({ type: "table", rows });
    } else text.push(line);
  }
  flush(); return blocks;
}