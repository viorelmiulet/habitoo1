import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filterPlaceOptions, type PlaceOption } from "@/lib/private-listing-geography";

type Props = {
  value: string;
  options: PlaceOption[];
  placeholder: string;
  allLabel: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

/** Listă cu câmp de căutare (diacritice ignorate) și numărul de anunțuri lângă fiecare opțiune. */
export function SearchableSelect({ value, options, placeholder, allLabel, ariaLabel, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selected ? `${selected.label} (${selected.count})` : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command filter={(itemValue, search) => (filterPlaceOptions([{ value: itemValue, label: itemValue, count: 0 }], search).length ? 1 : 0)}>
          <CommandInput placeholder={`Caută: ${placeholder.toLowerCase()}`} aria-label={`Caută ${ariaLabel.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>Nicio potrivire.</CommandEmpty>
            <CommandGroup>
              <CommandItem value={allLabel} onSelect={() => { onChange(""); setOpen(false); }}>
                <Check className={cn("mr-2 size-4", !value ? "opacity-100" : "opacity-0")} />
                {allLabel}
              </CommandItem>
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => { onChange(o.value); setOpen(false); }}>
                  <Check className={cn("mr-2 size-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  <span className="ml-auto pl-2 text-xs text-muted-foreground">{o.count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
