import { z } from "zod";
import { parseCsvRows } from "@/lib/market/csv";

export const outreachStatuses = ["pending", "sent", "failed", "bounced", "unsubscribed"] as const;
export const outreachStatusLabels: Record<(typeof outreachStatuses)[number], string> = {
  pending: "În așteptare", sent: "Trimise", failed: "Eșuate", bounced: "Respinse", unsubscribed: "Excluse",
};
export const outreachHeaders = ["agency_name", "email", "city", "region", "phone", "website", "address_type", "source_url"] as const;
export type OutreachRow = Record<(typeof outreachHeaders)[number], string>;
export type ImportSummary = { imported: number; duplicates: number; invalid: number; suppressed: number };
export type OutreachList = { id: string; name: string; created_at: string; total: number; counts: Record<(typeof outreachStatuses)[number], number> };
export type OutreachRecipient = OutreachRow & { id: string; status: (typeof outreachStatuses)[number]; created_at: string; sent_at: string | null; error: string | null };
export type OutreachDetail = { name: string; total: number; cities: string[]; rows: OutreachRecipient[] };
const emailSchema = z.string().max(254).email();
export function prepareOutreachCsv(csv: string) {
  if (csv.length > 5_000_000) throw new Error("Fișierul CSV este prea mare (maximum 5 MB).");
  const matrix = parseCsvRows(csv, ",");
  const headers = matrix.shift() ?? [];
  if (headers.map(h => h.trim()).join(",") !== outreachHeaders.join(",")) throw new Error(`Antetul CSV trebuie să fie: ${outreachHeaders.join(",")}`);
  if (matrix.length > 10_000) throw new Error("Importul acceptă maximum 10.000 de rânduri.");
  const seen = new Set<string>();
  const rows: OutreachRow[] = [];
  let invalid = 0, duplicates = 0;
  for (const cells of matrix) {
    const email = (cells[1] ?? "").trim().toLowerCase();
    if (cells.length !== outreachHeaders.length || cells.some(c => c.length > 2000) || !emailSchema.safeParse(email).success) { invalid++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    const row = Object.fromEntries(outreachHeaders.map((h, i) => [h, h === "email" ? email : (cells[i] ?? "").trim()])) as OutreachRow;
    rows.push(row);
  }
  return { rows, invalid, duplicates };
}