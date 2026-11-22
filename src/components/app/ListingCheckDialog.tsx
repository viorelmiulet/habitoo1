import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { checkListings, suggestListingWithAi, type ListingCheckRow } from "@/lib/listing-check/check.functions";
import type { DeducibleField } from "@/lib/listing-check/ai-suggestions";
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

/** O sugestie AI aplicată în formular, fără salvare. */
export type ListingSuggestionApply =
  | { kind: "title"; value: string }
  | { kind: "description"; value: string }
  | { kind: "field"; field: DeducibleField; value: number };

/** Evenimentul cu care bula Agentului AI pornește verificarea anunțului deschis. */
export { LISTING_CHECK_EVENT } from "./listing-check-event";

export function ListingCheckDialog({ open, onOpenChange, propertyIds, onGo, onApply }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyIds: string[];
  /** Doar în fișa proprietății: duce la câmpul vizat. */
  onGo?: (issue: CheckIssue) => void;
  /** Doar în fișa proprietății: completează câmpul în formular, fără salvare. */
  onApply?: (s: ListingSuggestionApply) => void;
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
        {q.data && single && q.data[0] ? <AiSuggestionsSection propertyId={q.data[0].propertyId} onApply={onApply} /> : null}
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

export function AiSuggestionsSection({ propertyId, onApply }: { propertyId: string; onApply?: (s: ListingSuggestionApply) => void }) {
  const fn = useServerFn(suggestListingWithAi);
  const q = useQuery({ queryKey: ["listing-check-ai", propertyId], queryFn: () => fn({ data: { propertyId } }), staleTime: 0, gcTime: 0, retry: false });
  const [done, setDone] = useState<Record<string, "applied" | "ignored">>({});
  // Fără AI activat pentru agenție: panoul rămâne doar cu regulile.
  if (q.data && !q.data.ok && q.data.disabled) return null;
  const item = (key: string, body: React.ReactNode, apply: ListingSuggestionApply | null) => {
    if (done[key] === "ignored") return null;
    return (
      <li key={key} className="rounded-md border border-border p-3 text-sm">
        {body}
        <div className="mt-2 flex gap-2">
          {apply && onApply ? (
            <Button type="button" size="sm" variant="secondary" disabled={done[key] === "applied"}
              onClick={() => { onApply(apply); setDone((d) => ({ ...d, [key]: "applied" })); }}>
              {done[key] === "applied" ? "Aplicat (nesalvat)" : "Aplică"}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={() => setDone((d) => ({ ...d, [key]: "ignored" }))}>Ignoră</Button>
        </div>
      </li>
    );
  };
  const s = q.data?.ok ? q.data.suggestions : null;
  return (
    <section className="mt-6 border-t border-border pt-4" data-testid="ai-suggestions">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-ai" /> Sugestii AI</h3>
      <p className="mb-3 text-xs text-muted-foreground">„Aplică” completează doar formularul. Nimic nu se salvează până nu salvezi tu.</p>
      {q.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Se generează sugestiile…</p> : null}
      {q.error ? <p className="text-sm text-destructive">Sugestiile AI nu sunt disponibile acum.</p> : null}
      {q.data && !q.data.ok ? <p className="text-sm text-muted-foreground">{q.data.message}</p> : null}
      {s ? (
        <ul className="space-y-2">
          {s.title ? item("title", <><p className="text-xs font-semibold text-muted-foreground">Titlu propus</p><p>{s.title}</p></>, { kind: "title", value: s.title }) : null}
          {s.description ? item("description", <><p className="text-xs font-semibold text-muted-foreground">Descriere propusă</p><p className="whitespace-pre-line">{s.description}</p></>, { kind: "description", value: s.description }) : null}
          {s.fields.map((f) => item(`field-${f.field}`, <><p><span className="font-semibold">{f.label}:</span> {f.value}</p><p className="mt-1 text-xs text-muted-foreground">Din descriere: „{f.evidence}”</p></>, { kind: "field", field: f.field, value: f.value }))}
          {s.questions.map((qq, i) => item(`q-${i}`, <><p className="text-xs font-semibold text-muted-foreground">Întrebare pentru agent</p><p>{qq}</p></>, null))}
          {s.price ? item("price", <><p className="text-xs font-semibold text-muted-foreground">Preț</p><p>{s.price.note}</p><p className="mt-1 text-xs text-muted-foreground">Sursa: {s.price.source}</p></>, null) : null}
          {!s.title && !s.description && s.fields.length === 0 && s.questions.length === 0 && !s.price ? <li className="text-sm text-muted-foreground">Nicio sugestie suplimentară.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
