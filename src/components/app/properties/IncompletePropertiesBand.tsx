import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type IncompleteProperty = { id: string; reference: string | null; title: string | null; missing: string[] };

export const INCOMPLETE_LIST_LIMIT = 100;

/** Cele mai multe lipsuri primele, apoi după referință; cel mult 100. */
export function sortIncomplete(items: IncompleteProperty[]) {
  const sorted = [...items].sort((a, b) => b.missing.length - a.missing.length
    || (a.reference ?? "").localeCompare(b.reference ?? "", "ro", { numeric: true }));
  return { shown: sorted.slice(0, INCOMPLETE_LIST_LIMIT), more: Math.max(0, sorted.length - INCOMPLETE_LIST_LIMIT) };
}

export function IncompletePropertiesBand({ items }: { items: IncompleteProperty[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const n = items.length;
  const { shown, more } = sortIncomplete(items);
  return (
    <>
      <div data-testid="properties-ai-band" className="flex flex-col gap-3 rounded-card border border-ai/30 bg-ai/5 px-4 py-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-ai">✦ {n} {n === 1 ? "fișă incompletă poate fi completată" : "fișe incomplete pot fi completate"} cu AI</span>
          <span className="text-muted-foreground"> — lipsesc etajul, suprafața, camerele sau dotările.</span>
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="shrink-0 border-ai/50 text-ai hover:bg-ai/10 hover:text-ai">
          Completează cu AI
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100vw-1rem)] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fișe incomplete</DialogTitle>
            <DialogDescription>Deschide fișa și folosește „Corectează cu AI” pentru a completa ce lipsește.</DialogDescription>
          </DialogHeader>
          <ul className="-mx-1 min-h-0 flex-1 divide-y divide-border overflow-y-auto px-1">
            {shown.map((p) => (
              <li key={p.id} data-testid="incomplete-row" className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.reference ? <span className="text-muted-foreground">{p.reference} · </span> : null}{p.title || "Fără titlu"}</p>
                  <p className="text-sm text-muted-foreground">Lipsesc: {p.missing.join(", ")}</p>
                </div>
                <Button asChild size="sm" variant="outline" className="min-h-11 shrink-0 sm:min-h-9">
                  <Link to="/app/properties/$id" params={{ id: p.id }} search={{ edit: true }}>Completează</Link>
                </Button>
              </li>
            ))}
          </ul>
          {more > 0 ? <p className="text-sm text-muted-foreground">și încă {more}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
