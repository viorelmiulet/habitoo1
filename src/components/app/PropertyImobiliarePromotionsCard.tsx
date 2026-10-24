/** Controlled promotion choices: only the parent publication action sends them. */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { ImobiliarePromotionsView } from "@/lib/portals/imobiliare-promotions.functions";
import { IMOBILIARE_CARD_PROMOTION_IDS, imobiliarePromotionControlBlocked, type ImobiliarePromotionChanges } from "@/lib/portals/imobiliare/card-promotions";

export function PropertyImobiliarePromotionsCard({ view, drafts, disabled, errors, onChange, onRefresh, loading, loadError }: {
  view?: ImobiliarePromotionsView;
  drafts: ImobiliarePromotionChanges;
  disabled: boolean;
  errors: Record<string, string>;
  onChange: (id: string, value: boolean | number) => void;
  onRefresh: () => void;
  loading: boolean;
  loadError?: string;
}) {
  if (loading && !view) return <p className="text-xs text-muted-foreground">Se citesc locurile de promovare…</p>;
  if (loadError) return <p className="text-xs text-destructive">{loadError}</p>;
  if (!view?.available) return <p className="text-xs text-muted-foreground">{view?.message}</p>;
  const rows = IMOBILIARE_CARD_PROMOTION_IDS.flatMap((id) => view.promotions.filter((row) => row.id === id));
  return <div className="relative z-10 mt-3 border-t border-border pt-3" aria-label="Promovări Imobiliare.ro">
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-xs font-semibold">Promovări</span>
      <Button type="button" variant="ghost" size="icon" className="size-8" title="Actualizează locurile libere" aria-label="Actualizează locurile libere" disabled={loading || disabled} onClick={onRefresh}><RefreshCw className="size-3.5" /></Button>
    </div>
    <ul className="space-y-2">{rows.map((row) => {
      const wanted = drafts[row.id] ?? row.value;
      const active = row.value === true || (typeof row.value === "number" && row.value > 0);
      const blocked = imobiliarePromotionControlBlocked(row);
      const error = errors[row.id] ?? row.error;
      return <li key={row.id} className="min-w-0">
        <div className="flex min-h-11 flex-wrap items-center gap-2">
          {row.kind === "numeric" ? <Input type="number" min={0} max={row.max ?? undefined} value={typeof wanted === "number" ? wanted : 0} className="h-9 w-20 text-base" aria-label={`${row.label} pentru acest anunț`} disabled={disabled || blocked} onChange={(event) => onChange(row.id, Math.max(0, Math.trunc(Number(event.target.value) || 0)))} /> : <Checkbox id={`imobiliare-promotion-${row.id}`} checked={wanted === true} disabled={disabled || (blocked && wanted !== true)} aria-label={`${row.label} pentru acest anunț`} onCheckedChange={(checked) => onChange(row.id, checked === true)} />}
          <label htmlFor={row.kind === "boolean" ? `imobiliare-promotion-${row.id}` : undefined} className="min-w-0 flex-1 text-xs font-medium">{row.label}</label>
          <span className="text-xs text-muted-foreground">{row.slotType ? `${row.available ?? "—"}/${row.total ?? "—"} libere` : "Fără limită"}</span>
        </div>
        <p className="text-xs text-muted-foreground">{active ? "Activă" : row.value === null ? "Stare necunoscută" : "Inactivă"}{drafts[row.id] !== undefined && drafts[row.id] !== row.value ? " · Modificare în așteptare" : ""}{row.remaining !== null ? ` · Alocare: ${row.remaining} rămase` : ""}{row.agencyRemaining != null ? ` · Plafon: ${row.agencyRemaining} rămase` : ""}</p>
        {row.value === null && row.manageable ? <Button type="button" variant="link" size="compact" disabled={disabled} onClick={() => onChange(row.id, row.kind === "numeric" ? 0 : false)}>Oprește</Button> : null}
        {error && (row.id !== "bonus" || errors[row.id]) ? <p role="alert" className="mt-1 break-words text-xs text-destructive">{error}</p> : blocked ? <p className="mt-1 text-xs text-muted-foreground">Nu sunt locuri disponibile pentru activare.</p> : null}
      </li>;
    })}</ul>
  </div>;
}
