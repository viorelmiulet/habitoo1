/**
 * Termenul abonamentului agenției: 30 de zile, 12 luni sau fără termen. Data de
 * expirare se calculează în baza de date, din momentul salvării — niciodată
 * introdusă manual. Componentă comună paginilor „Agenții” și „Stare agenții”.
 */
import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SUBSCRIPTION_TERMS,
  SUBSCRIPTION_TERM_LABELS,
  type SubscriptionTerm,
} from "@/lib/subscription";

/**
 * Valoarea preselectată în casetă: orice perioadă validă (inclusiv cele
 * gratuite) se recunoaște; „none” doar când agenția chiar nu are termen.
 */
export function subscriptionPickerValue(term: string | null): SubscriptionTerm | "none" {
  return SUBSCRIPTION_TERMS.includes(term as SubscriptionTerm)
    ? (term as SubscriptionTerm)
    : "none";
}

export function SubscriptionPicker({
  term,
  onSave,
  saving,
}: {
  term: string | null;
  onSave: (term: SubscriptionTerm | null) => void;
  saving: boolean;
}) {
  // Recunoaște toate perioadele valide (inclusiv cele gratuite); „none” doar
  // când agenția chiar nu are termen.
  const current = SUBSCRIPTION_TERMS.includes(term as SubscriptionTerm)
    ? (term as SubscriptionTerm)
    : "none";
  const [value, setValue] = useState<string>(current);
  const dirty = value !== current;
  const asTerm = value === "none" ? null : (value as SubscriptionTerm);
  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Fără termen (nelimitat)</SelectItem>
          {SUBSCRIPTION_TERMS.map((t) => (
            <SelectItem key={t} value={t}>
              {SUBSCRIPTION_TERM_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={!dirty || saving}
        onClick={() => onSave(asTerm)}
      >
        Salvează
      </Button>
      {asTerm && !dirty ? (
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => onSave(asTerm)}>
          <RefreshCw className="mr-1.5 size-4" />
          Reînnoiește
        </Button>
      ) : null}
    </div>
  );
}
