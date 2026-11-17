/** Antetul fișei după macheta crm-fisa: navigare, titlu, status, procent completare și acțiuni existente. */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { sheetCompleteness, sheetTone, type SheetInput } from "@/lib/property-sheet-completeness";

export function PropertySheetHeader({ reference, title, status, sheet, actions }: {
  reference?: string | null; title: string; status?: ReactNode; sheet: SheetInput; actions?: ReactNode;
}) {
  const pct = sheetCompleteness(sheet);
  const tone = sheetTone(pct);
  return (
    <div className="flex flex-wrap items-end justify-between gap-4" data-sheet-header>
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link to="/app/properties" className="hover:text-foreground">Proprietăți</Link>
          {reference ? <><span aria-hidden className="mx-2">/</span><span className="font-mono text-foreground">{reference}</span></> : null}
        </nav>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[26px] leading-tight font-bold">{title}</h1>
          {status}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[140px]" aria-label={`Fișă completă ${pct}%`} data-testid="sheet-completeness">
          <span className="font-mono text-xs text-muted-foreground">Fișă completă <span className="text-foreground">{pct}%</span></span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
            <span className={cn("block h-full rounded-full", tone === "success" ? "bg-success" : tone === "ai" ? "bg-ai" : "bg-gold")} style={{ width: `${pct}%` }} />
          </span>
        </div>
        {actions}
      </div>
    </div>
  );
}
