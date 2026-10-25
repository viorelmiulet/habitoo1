import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ZONE_LETTERS,
  filterPlaceOptions,
  firstIndexForLetter,
  type PlaceOption,
} from "@/lib/private-listing-geography";

type Props = {
  zones: PlaceOption[];
  isBucharest: boolean;
  selected: string[];
  disabled?: boolean;
  onApply: (next: string[]) => void;
};

const optionId = (value: string) => `zone-opt-${value.replace(/\s+/g, "-")}`;

/** Fereastra „Alege zone”: căutare, litere A–Z, grupare pe sectoare la București, selecție multiplă. */
export function ZonePickerDialog({ zones, isBucharest, selected, disabled, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(selected);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) {
      setPicked(selected);
      setQuery("");
    }
  }, [open, selected]);

  const visible = useMemo(() => filterPlaceOptions(zones, query), [zones, query]);
  const sectors = visible.filter((z) => z.kind === "sector");
  const neighborhoods = visible.filter((z) => z.kind !== "sector");
  const groups = isBucharest
    ? [
        ...sectors.map((sector) => ({
          sector,
          children: neighborhoods.filter((n) => n.sector === sector.value),
        })),
        ...(neighborhoods.some((n) => !n.sector)
          ? [{ sector: null as PlaceOption | null, children: neighborhoods.filter((n) => !n.sector) }]
          : []),
      ]
    : [{ sector: null as PlaceOption | null, children: visible }];

  const toggle = (value: string) =>
    setPicked((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  const jumpToLetter = (letter: string) => {
    const index = firstIndexForLetter(visible, letter);
    if (index < 0) return;
    document.getElementById(optionId(visible[index].value))?.scrollIntoView({ block: "start" });
  };

  const byValue = new Map(zones.map((z) => [z.value, z]));

  const zoneRow = (option: PlaceOption, indented: boolean) => (
    <label
      key={option.value}
      id={optionId(option.value)}
      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent ${indented ? "ml-6" : ""}`}
    >
      <Checkbox
        checked={picked.includes(option.value)}
        onCheckedChange={() => toggle(option.value)}
        aria-label={option.label}
      />
      <span className="truncate">{option.label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{option.count}</span>
    </label>
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-label="Zonă"
        aria-haspopup="dialog"
        className="w-full justify-between font-normal"
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{selected.length ? `${selected.length} zone` : "Zonă"}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl" aria-label="Alege zone">
          <DialogHeader>
            <DialogTitle>Alege zone</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Caută zona"
                aria-label="Caută zona"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-1" aria-label="Sare la litera">
              {ZONE_LETTERS.map((letter) => {
                const available = firstIndexForLetter(visible, letter) >= 0;
                return (
                  <button
                    key={letter}
                    type="button"
                    disabled={!available}
                    className="text-sm font-medium text-primary hover:underline disabled:text-muted-foreground/40 disabled:no-underline"
                    onClick={() => jumpToLetter(letter)}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 border-b border-border pb-2 text-sm font-medium">
            <Checkbox
              checked={picked.length === 0}
              onCheckedChange={(checked) => (checked === true ? setPicked([]) : undefined)}
              aria-label="Toate zonele"
            />
            Toate zonele
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <ScrollArea className="h-80 pr-3">
              {groups.map(({ sector, children }) => (
                <div key={sector?.value ?? "alte"} className="pb-2">
                  {sector ? (
                    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-semibold hover:bg-accent">
                      <Checkbox
                        checked={picked.includes(sector.value)}
                        onCheckedChange={() => toggle(sector.value)}
                        aria-label={sector.label}
                      />
                      <span className="truncate">{sector.label}</span>
                      <span className="ml-auto text-xs font-normal text-muted-foreground">{sector.count}</span>
                    </label>
                  ) : null}
                  {children.map((child) => zoneRow(child, Boolean(sector)))}
                </div>
              ))}
              {visible.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">Nicio zonă nu corespunde căutării.</p>
              ) : null}
            </ScrollArea>
            <div className="border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <p className="pb-2 text-sm font-semibold">Zone selectate</p>
              {picked.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio zonă selectată.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {picked.map((value) => (
                    <li
                      key={value}
                      className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
                    >
                      {byValue.get(value)?.label ?? value}
                      <button
                        type="button"
                        aria-label={`Scoate ${byValue.get(value)?.label ?? value}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => toggle(value)}
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Anulează
            </Button>
            <Button type="button" onClick={() => { onApply(picked); setOpen(false); }}>
              Aplică
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
