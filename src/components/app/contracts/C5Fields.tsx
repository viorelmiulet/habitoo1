import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CLIENT_CAPACITIES,
  COMMISSION_PAYMENT_MOMENTS,
  TRANSACTION_TYPES,
  USE_PURPOSES,
  type C5Form,
  type C5Kind,
} from "@/lib/contracts/c5";

const digits = (value: string) => value.replace(/\D/g, "");

export function C5Fields({
  kind,
  form,
  onChange,
  properties,
}: {
  kind: C5Kind;
  form: C5Form;
  onChange: (form: C5Form) => void;
  properties: { id: string; label: string }[];
}) {
  const set = <K extends keyof C5Form>(key: K, value: C5Form[K]) => onChange({ ...form, [key]: value });
  const toggleViewing = (id: string, checked: boolean) =>
    set(
      "viewingPropertyIds",
      checked ? [...form.viewingPropertyIds, id] : form.viewingPropertyIds.filter((value) => value !== id),
    );
  return (
    <div className="grid min-w-0 gap-4 rounded-md border border-border p-4 sm:grid-cols-2">
      <h3 className="text-sm font-semibold sm:col-span-2">Date contract</h3>
      {kind === "commission" ? (
        <>
          <Choice label="Calitatea clientului" value={form.clientCapacity} options={CLIENT_CAPACITIES} onChange={(v) => set("clientCapacity", v)} />
          <Choice label="Tipul tranzacției" value={form.transactionType} options={TRANSACTION_TYPES} onChange={(v) => set("transactionType", v)} />
          <Text label="Comision" value={form.commission} onChange={(v) => set("commission", v)} placeholder="3% + TVA din prețul de vânzare" className="sm:col-span-2" />
          <Text label="Durată (luni)" value={form.durationMonths} onChange={(v) => set("durationMonths", digits(v))} />
          <Choice label="Momentul plății comisionului" value={form.paymentMoment} options={COMMISSION_PAYMENT_MOMENTS} onChange={(v) => set("paymentMoment", v)} prefix="la " />
          <Text label="Luni de protecție" value={form.protectionMonths} onChange={(v) => set("protectionMonths", digits(v))} />
        </>
      ) : null}
      {kind === "loan_for_use" ? (
        <>
          <Text label="Adresa proprietății" value={form.propertyAddress} onChange={(v) => set("propertyAddress", v)} className="sm:col-span-2" />
          <Text label="Nr. carte funciară" value={form.landBook} onChange={(v) => set("landBook", v)} />
          <Text label="Nr. cadastral" value={form.cadastralNumber} onChange={(v) => set("cadastralNumber", v)} />
          <Choice label="Scopul folosinței" value={form.usePurpose} options={USE_PURPOSES} onChange={(v) => set("usePurpose", v)} />
          <Text label="Data începerii" value={form.startDate} onChange={(v) => set("startDate", v)} placeholder="ZZ.LL.AAAA" />
          <div className="space-y-1.5">
            <Label>Durata</Label>
            <div className="flex items-center gap-3">
              <Input
                aria-label="Durata în luni"
                value={form.loanMonths}
                disabled={form.loanIndefinite}
                onChange={(event) => set("loanMonths", digits(event.target.value))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">luni</span>
              <div className="flex items-center gap-2">
                <Checkbox id="loan-indefinite" checked={form.loanIndefinite} onCheckedChange={(c) => set("loanIndefinite", c === true)} />
                <Label htmlFor="loan-indefinite" className="text-sm font-normal">Nedeterminată</Label>
              </div>
            </div>
          </div>
        </>
      ) : null}
      {kind === "viewing" ? (
        <>
          <Text label="Data vizionării" value={form.viewingDate} onChange={(v) => set("viewingDate", v)} placeholder="ZZ.LL.AAAA" />
          <Choice label="Tipul tranzacției" value={form.transactionType} options={TRANSACTION_TYPES} onChange={(v) => set("transactionType", v)} />
          <Text label="Comision" value={form.commission} onChange={(v) => set("commission", v)} placeholder="2% + TVA din prețul de vânzare" />
          <Text label="Luni de protecție" value={form.protectionMonths} onChange={(v) => set("protectionMonths", digits(v))} />
          <fieldset className="min-w-0 space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">
              Imobile vizionate ({form.viewingPropertyIds.length} alese, minim 1)
            </legend>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {properties.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nu există proprietăți disponibile.</p>
              ) : (
                properties.map((property) => (
                  <label key={property.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={form.viewingPropertyIds.includes(property.id)}
                      onCheckedChange={(c) => toggleViewing(property.id, c === true)}
                    />
                    <span className="min-w-0 flex-1 truncate">{property.label}</span>
                  </label>
                ))
              )}
            </div>
          </fieldset>
        </>
      ) : null}
      <Text label="Localitatea încheierii" value={form.locality} onChange={(v) => set("locality", v)} />
      <Text label="Număr de exemplare" value={form.copies} onChange={(v) => set("copies", digits(v))} />
    </div>
  );
}

function Text({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      <Input aria-label={label} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Choice<T extends string>({ label, value, options, onChange, prefix = "" }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; prefix?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {prefix}
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
