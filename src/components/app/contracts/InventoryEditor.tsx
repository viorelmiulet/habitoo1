import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INVENTORY_CONDITIONS,
  type InventoryCondition,
  type InventoryItem,
} from "@/lib/contracts/templates";

export function InventoryEditor({
  items,
  onChange,
}: {
  items: InventoryItem[];
  onChange: (items: InventoryItem[]) => void;
}) {
  const patch = (index: number, values: Partial<InventoryItem>) =>
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...values } : item)));

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[minmax(150px,2fr)_72px_140px_minmax(110px,1fr)_minmax(140px,1.5fr)_36px] gap-2 px-1 md:grid">
        {(["Denumire", "Cant.", "Stare", "Locație", "Observații", ""] as const).map((label) => (
          <Label key={label} className="text-xs text-muted-foreground">{label}</Label>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={`${index}-${item.name}`}
          className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[minmax(150px,2fr)_72px_140px_minmax(110px,1fr)_minmax(140px,1.5fr)_36px] md:border-0 md:p-0"
        >
          <Input aria-label="Denumire" value={item.name} onChange={(event) => patch(index, { name: event.target.value })} />
          <Input aria-label="Cantitate" inputMode="numeric" value={String(item.quantity)} onChange={(event) => patch(index, { quantity: Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1) })} />
          <Select value={item.condition} onValueChange={(condition) => patch(index, { condition: condition as InventoryCondition })}>
            <SelectTrigger aria-label="Stare"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INVENTORY_CONDITIONS.map((condition) => <SelectItem key={condition} value={condition}>{condition}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input aria-label="Locație" value={item.location} onChange={(event) => patch(index, { location: event.target.value })} />
          <Input aria-label="Observații" value={item.notes} onChange={(event) => patch(index, { notes: event.target.value })} />
          <Button type="button" size="icon" variant="ghost" aria-label={`Șterge ${item.name || "rândul"}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, { name: "", quantity: 1, condition: "Buna", location: "", notes: "" }])}>
        <Plus className="size-4" /> Adaugă bun
      </Button>
    </div>
  );
}