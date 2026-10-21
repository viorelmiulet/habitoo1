/**
 * Filtrul „Promovare” din lista de proprietăți. Doar citire: nu pornește și
 * nu oprește nicio promovare. Opțiunile vin din registru, doar pentru
 * portalurile conectate ale agenției.
 */
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import {
  PROMOTION_FILTER_ANY,
  PROMOTION_FILTER_NONE,
  type PromotionFilterGroup,
} from "@/lib/portals/promotion-filter";
import { cn } from "@/lib/utils";

export function parsePromotionValues(value: string): string[] {
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

export function serializePromotionValues(values: string[]): string {
  return [...new Set(values)].join(",");
}

/**
 * Comutarea unei valori: „Orice promovare” și „Fără promovare” sunt exclusive
 * față de serviciile concrete; serviciile se combină liber între ele.
 */
export function togglePromotionValue(current: string[], value: string): string[] {
  const special = value === PROMOTION_FILTER_ANY || value === PROMOTION_FILTER_NONE;
  if (current.includes(value)) return current.filter((v) => v !== value);
  if (special) return [value];
  return [...current.filter((v) => v !== PROMOTION_FILTER_ANY && v !== PROMOTION_FILTER_NONE), value];
}

/** Textul alegerii, folosit în buton și în pastila filtrului activ. */
export function promotionFilterLabel(value: string, groups: PromotionFilterGroup[]): string {
  const values = parsePromotionValues(value);
  if (values.length === 0) return "Oricare";
  if (values.includes(PROMOTION_FILTER_ANY)) return "Orice promovare";
  if (values.includes(PROMOTION_FILTER_NONE)) return "Fără promovare";
  const labels = values.map((v) => {
    for (const group of groups) {
      const option = group.options.find((o) => o.value === v);
      if (option) return `${group.portalName} · ${option.label}`;
    }
    return v;
  });
  if (labels.length <= 2) return labels.join(", ");
  return `${labels[0]} +${labels.length - 1}`;
}

export function PromotionFilterSelect({
  value,
  groups,
  onChange,
  className,
  id,
}: {
  value: string;
  groups: PromotionFilterGroup[];
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parsePromotionValues(value);
  const toggle = (v: string) =>
    onChange(v === "" ? "" : serializePromotionValues(togglePromotionValue(selected, v)));

  const item = (val: string, label: string, indent = false) => (
    <CommandItem
      key={val}
      value={val}
      onSelect={() => toggle(val)}
      className={cn(indent && "pl-11", selected.includes(val) && "bg-accent")}
    >
      <span className="flex-1">{label}</span>
      {selected.includes(val) ? <Check className="size-4" aria-hidden /> : null}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-label="Promovare"
          className={cn("w-full justify-between gap-2 font-normal", className)}
        >
          <span className="truncate">{promotionFilterLabel(value, groups)}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <p className="px-3 pt-3 pb-1 text-xs text-muted-foreground">
            Doar anunțurile publicate pe portalul respectiv. Poți alege mai multe.
          </p>
          <CommandList className="max-h-96">
            <CommandGroup>
              {item("", "Oricare")}
              {item(PROMOTION_FILTER_ANY, "Orice promovare")}
              {item(PROMOTION_FILTER_NONE, "Fără promovare")}
            </CommandGroup>
            {groups.map((group) => (
              <CommandGroup
                key={group.portalId}
                data-portal-group={group.portalId}
                heading={
                  <span className="flex items-center gap-2 text-sm font-semibold normal-case text-foreground">
                    <PortalLogoStack portalId={group.portalId} name={group.portalName} size={28} />
                    {group.portalName}
                  </span>
                }
              >
                {group.options.map((option) => item(option.value, option.label, true))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
