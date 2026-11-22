import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { checkListings, type ListingCheckRow } from "@/lib/listing-check/check.functions";
import type { CheckIssue, CheckSeverity } from "@/lib/listing-check/rules";
import { cn } from "@/lib/utils";

const GROUPS: { key: CheckSeverity; label: string }[] = [
  { key: "required", label: "Obligatoriu" },
  { key: "recommended", label: "Recomandat" },
  { key: "optional", label: "Opțional" },
];

function scoreTone(score: number) {
  return score >= 80 ? "text-primary" : score >= 50 ? "text-foreground" : "text-destructive";
}

export function ListingCheckDialog({ open, onOpenChange, propertyIds, onGo }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyIds: string[];
  /** Doar în fișa proprietății: duce la câmpul vizat. */
  onGo?: (issue: CheckIssue) => void;
}) {
  const fn = useServerFn(checkListings);
  const q = useQuery({
    queryKey: ["listing-check", propertyIds],
    queryFn: () => fn({ data: { propertyIds } }),
    enabled: open && propertyIds.length > 0,
    staleTime: 0,
    gcTime: 0,
  });
  const single = propertyIds.length === 1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{single ? "Verificarea anunțului" : `Verificarea a ${propertyIds.length} anunțuri`}</DialogTitle>
          <DialogDescription>Reguli fixe, fără modificări ale anunțului.</DialogDescription>
        </DialogHeader>
        {q.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Se verifică…</p> : null}
        {q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : null}
        {q.data && single && q.data[0] ? <SingleResult row={q.data[0]} onGo={onGo ? (i) => { onOpenChange(false); onGo(i); } : undefined} /> : null}
        {q.data && !single ? <BulkTable rows={q.data} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SingleResult({ row, onGo }: { row: ListingCheckRow; onGo?: (issue: CheckIssue) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-2"><span className={cn("text-4xl font-extrabold", scoreTone(row.score))}>{row.score}</span><span className="text-muted-foreground">/ 100</span></div>
      {row.issues.length === 0 ? <p className="text-sm">Nicio problemă găsită.</p> : null}
      {GROUPS.map((g) => {
        const items = row.issues.filter((i) => i.severity === g.key);
        if (items.length === 0) return null;
        return (
          <section key={g.key}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label} ({items.length})</h3>
            <ul className="space-y-2">
              {items.map((i, idx) => (
                <li key={`${i.code}-${idx}`} className="rounded-md border border-border p-3 text-sm">
                  <p>{i.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Câmp: {i.field}
                    {onGo ? <> · <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onGo(i)}>Mergi la câmp</button></> : null}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function BulkTable({ rows }: { rows: ListingCheckRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2">Anunț</th><th>Nota</th><th>Obligatoriu</th><th>Recomandat</th><th>Opțional</th></tr></thead>
      <tbody>
        {rows.map((r) => {
          const c = (s: CheckSeverity) => r.issues.filter((i) => i.severity === s).length;
          return (
            <tr key={r.propertyId} className="border-b border-border">
              <td className="py-2 pr-2"><Link to="/app/properties/$id" params={{ id: r.propertyId }} className="font-semibold hover:text-primary">{r.reference ?? r.title ?? "Anunț"}</Link>{r.title && r.reference ? <span className="block max-w-[260px] truncate text-xs text-muted-foreground">{r.title}</span> : null}</td>
              <td className={cn("font-bold", scoreTone(r.score))}>{r.score}</td>
              <td>{c("required")}</td><td>{c("recommended")}</td><td>{c("optional")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
