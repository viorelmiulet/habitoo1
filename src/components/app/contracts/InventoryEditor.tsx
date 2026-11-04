import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      {items.length > 0 ? (
        <div className="hidden overflow-hidden rounded-[14px] border border-border md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {(["Denumire", "Cant.", "Stare", "Locație", "Observații"] as const).map((label) => <TableHead key={label}>{label}</TableHead>)}
                <TableHead className="w-12"><span className="sr-only">Acțiuni</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
          const name = <Input aria-label="Denumire" value={item.name} onChange={(event) => patch(index, { name: event.target.value })} />;
          const qty = <Input aria-label="Cantitate" inputMode="numeric" value={String(item.quantity)} onChange={(event) => patch(index, { quantity: Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1) })} />;
          const cond = (
            <Select value={item.condition} onValueChange={(condition) => patch(index, { condition: condition as InventoryCondition })}>
              <SelectTrigger aria-label="Stare"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVENTORY_CONDITIONS.map((condition) => <SelectItem key={condition} value={condition}>{condition}</SelectItem>)}
              </SelectContent>
            </Select>
          );
          const loc = <Input aria-label="Locație" value={item.location} onChange={(event) => patch(index, { location: event.target.value })} />;
          const notes = <Input aria-label="Observații" value={item.notes} onChange={(event) => patch(index, { notes: event.target.value })} />;
          const del = (
            <Button type="button" size="icon" variant="ghost" className="size-11 md:size-10" aria-label={`Șterge ${item.name || "rândul"}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>
              <Trash2 className="size-4" />
            </Button>
          );
                return (
                  <TableRow key={index} className="h-12 hover:bg-transparent">
                    <TableCell className="min-w-[150px]">{name}</TableCell>
                    <TableCell className="w-[88px]">{qty}</TableCell>
                    <TableCell className="w-[150px]">{cond}</TableCell>
                    <TableCell className="min-w-[110px]">{loc}</TableCell>
                    <TableCell className="min-w-[140px]">{notes}</TableCell>
                    <TableCell className="w-12">{del}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <div className="space-y-2 md:hidden">
        {items.map((item, index) => {
            const name = <Input aria-label="Denumire" value={item.name} onChange={(event) => patch(index, { name: event.target.value })} />;
            const qty = <Input aria-label="Cantitate" inputMode="numeric" value={String(item.quantity)} onChange={(event) => patch(index, { quantity: Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1) })} />;
            const cond = (
              <Select value={item.condition} onValueChange={(condition) => patch(index, { condition: condition as InventoryCondition })}>
                <SelectTrigger aria-label="Stare"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVENTORY_CONDITIONS.map((condition) => <SelectItem key={condition} value={condition}>{condition}</SelectItem>)}
                </SelectContent>
              </Select>
            );
            const loc = <Input aria-label="Locație" value={item.location} onChange={(event) => patch(index, { location: event.target.value })} />;
            const notes = <Input aria-label="Observații" value={item.notes} onChange={(event) => patch(index, { notes: event.target.value })} />;
            const del = (
              <Button type="button" size="icon" variant="ghost" className="size-11 md:size-10" aria-label={`Șterge ${item.name || "rândul"}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 className="size-4" />
              </Button>
            );
          return (
            <div key={index} className="grid min-w-0 gap-2 rounded-[12px] border border-border bg-card p-3">
              <div className="flex items-start gap-2"><div className="min-w-0 flex-1">{name}</div>{del}</div>
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">{qty}{cond}</div>
              {loc}
              {notes}
            </div>
          );
        })}
      </div>
      <Button type="button" variant="outline" className="h-11 w-full rounded-[10px] sm:h-10 sm:w-auto" onClick={() => onChange([...items, { name: "", quantity: 1, condition: "Buna", location: "", notes: "" }])}>
        <Plus className="size-4" /> Adaugă bun
      </Button>
    </div>
  );
}