import { Button } from "@/components/ui/button";
import type { DisplayCurrency } from "@/lib/commissions-reports";

export function CommissionCurrencySelect({ value, onChange }: { value: DisplayCurrency; onChange: (v: DisplayCurrency) => void }) {
  return <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">Afișează în:</span>
    <div className="flex gap-1" role="group" aria-label="Afișează în">
      {(["EUR", "RON"] as const).map(c => <Button key={c} size="sm" variant={c === value ? "default" : "outline"} aria-pressed={c === value} onClick={() => onChange(c)}>{c}</Button>)}
    </div>
  </div>;
}