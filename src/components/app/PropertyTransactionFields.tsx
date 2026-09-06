/**
 * Tipul tranzacției unei proprietăți: vânzare, închiriere sau ambele simultan.
 * Fiecare tranzacție activă are propriul preț și propria monedă, exact cum are
 * nevoie feedul public (`pretvanzare`/`monedavanzare`, `pretinchiriere`/`monedainchiriere`).
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const CURRENCY_OPTIONS = ["EUR", "RON", "USD"] as const;

export type TransactionValue = {
  for_sale: boolean;
  for_rent: boolean;
  sale_price: number | null;
  sale_currency: string | null;
  rent_price: number | null;
  rent_currency: string | null;
};

export const emptyTransaction: TransactionValue = {
  for_sale: true,
  for_rent: false,
  sale_price: null,
  sale_currency: "EUR",
  rent_price: null,
  rent_currency: "EUR",
};

/**
 * Câmpurile trimise la salvare. `transaction_kind`, `price` și `currency` rămân
 * sincronizate cu tranzacția principală, ca filtrele și matching-ul existente
 * să funcționeze neschimbat.
 */
/** True dacă utilizatorul a bifat cel puțin una dintre variantele de tranzacție. */
export function hasTransactionSelection(v: TransactionValue) {
  return v.for_sale || v.for_rent;
}

export function transactionPayload(v: TransactionValue) {
  const forSale = v.for_sale || !v.for_rent; // niciuna bifată → tratăm ca vânzare
  const primaryIsSale = forSale;
  return {
    for_sale: forSale,
    for_rent: v.for_rent,
    sale_price: forSale ? v.sale_price : null,
    sale_currency: forSale ? (v.sale_currency ?? "EUR") : null,
    rent_price: v.for_rent ? v.rent_price : null,
    rent_currency: v.for_rent ? (v.rent_currency ?? "EUR") : null,
    transaction_kind: (primaryIsSale ? "sale" : "rent") as "sale" | "rent",
    price: primaryIsSale ? v.sale_price : v.rent_price,
    currency: (primaryIsSale ? (v.sale_currency ?? "EUR") : (v.rent_currency ?? "EUR")) as string,
  };
}

/** Citește valorile din rândul existent al proprietății (compatibil cu datele vechi). */
export function transactionFromProperty(p: {
  for_sale?: boolean | null;
  for_rent?: boolean | null;
  sale_price?: number | null;
  sale_currency?: string | null;
  rent_price?: number | null;
  rent_currency?: string | null;
  transaction_kind?: string | null;
  price?: number | null;
  currency?: string | null;
}): TransactionValue {
  const isRent = p.transaction_kind === "rent";
  const forSale = p.for_sale ?? !isRent;
  const forRent = p.for_rent ?? isRent;
  return {
    for_sale: forSale,
    for_rent: forRent,
    sale_price: p.sale_price ?? (isRent ? null : (p.price ?? null)),
    sale_currency: p.sale_currency ?? (isRent ? "EUR" : (p.currency ?? "EUR")),
    rent_price: p.rent_price ?? (isRent ? (p.price ?? null) : null),
    rent_currency: p.rent_currency ?? (isRent ? (p.currency ?? "EUR") : "EUR"),
  };
}

type Props = {
  idPrefix?: string;
  value: TransactionValue;
  onChange: (next: TransactionValue) => void;
};

export function PropertyTransactionFields({ idPrefix = "tx", value, onChange }: Props) {
  const set = (patch: Partial<TransactionValue>) => onChange({ ...value, ...patch });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bifează cel puțin o variantă: de vânzare, de închiriere sau ambele simultan. Completează prețul pentru
        fiecare variantă bifată.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              id={`${idPrefix}-for-sale`}
              checked={value.for_sale}
              onCheckedChange={(c) => set({ for_sale: c === true })}
            />
            <Label htmlFor={`${idPrefix}-for-sale`} className="cursor-pointer font-medium">
              De vânzare
            </Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-sale-price`}>Preț vânzare</Label>
              <Input
                id={`${idPrefix}-sale-price`}
                type="number"
                min="0"
                disabled={!value.for_sale}
                value={value.sale_price ?? ""}
                onChange={(e) => set({ sale_price: num(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-sale-currency`}>Monedă</Label>
              <Select
                value={value.sale_currency ?? "EUR"}
                onValueChange={(v) => set({ sale_currency: v })}
                disabled={!value.for_sale}
              >
                <SelectTrigger id={`${idPrefix}-sale-currency`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              id={`${idPrefix}-for-rent`}
              checked={value.for_rent}
              onCheckedChange={(c) => set({ for_rent: c === true })}
            />
            <Label htmlFor={`${idPrefix}-for-rent`} className="cursor-pointer font-medium">
              De închiriere
            </Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-rent-price`}>Chirie / lună</Label>
              <Input
                id={`${idPrefix}-rent-price`}
                type="number"
                min="0"
                disabled={!value.for_rent}
                value={value.rent_price ?? ""}
                onChange={(e) => set({ rent_price: num(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-rent-currency`}>Monedă</Label>
              <Select
                value={value.rent_currency ?? "EUR"}
                onValueChange={(v) => set({ rent_currency: v })}
                disabled={!value.for_rent}
              >
                <SelectTrigger id={`${idPrefix}-rent-currency`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
