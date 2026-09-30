/**
 * Filtrul „Publicare pe portaluri” din lista de proprietăți. Doar citire:
 * nu publică și nu retrage nimic. Portalurile sunt doar cele activate agenției.
 */
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import {
  PORTAL_BUCKET_LABELS,
  parsePortalFilter,
  type PortalFilterBucket,
} from "@/lib/portals/portal-state";
import { cn } from "@/lib/utils";

export type PortalFilterOption = { portalId: string; name: string; pushSupported: boolean };

const BUCKETS: PortalFilterBucket[] = ["published", "unpublished", "error"];
const ANY_LABELS: Record<PortalFilterBucket, string> = {
  published: "Publicate pe cel puțin un portal",
  unpublished: "Nepublicate pe niciun portal",
  error: "Cu erori pe cel puțin un portal",
};

export function bucketLabel(bucket: PortalFilterBucket, pushSupported: boolean) {
  return bucket === "published" && !pushSupported
    ? "Publicate (în feed)"
    : PORTAL_BUCKET_LABELS[bucket];
}

/** Textul alegerii, folosit în buton și în pastila filtrului activ. */
export function portalFilterLabel(value: string, options: PortalFilterOption[]): string {
  const f = parsePortalFilter(value);
  if (!f) return "Oricare";
  if (f.portal === "any") return ANY_LABELS[f.state];
  const opt = options.find((o) => o.portalId === f.portal);
  return `${bucketLabel(f.state, opt?.pushSupported ?? true)} · ${opt?.name ?? f.portal}`;
}

export function PortalFilterSelect({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: PortalFilterOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parsePortalFilter(value);
  const selectedPortal =
    parsed && parsed.portal !== "any" ? options.find((o) => o.portalId === parsed.portal) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Publicare pe portaluri"
          className={cn("w-72 justify-between gap-2 font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedPortal ? (
              <PortalLogoStack portalId={selectedPortal.portalId} name={selectedPortal.name} size={22} />
            ) : null}
            <span className="truncate">{portalFilterLabel(value, options)}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <PortalFilterOptionsList
          value={value}
          options={options}
          onSelect={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Lista de opțiuni (exportată separat pentru teste). */
export function PortalFilterOptionsList({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: PortalFilterOption[];
  onSelect: (value: string) => void;
}) {
  const item = (val: string, label: string, indent = false) => (
    <CommandItem
      key={val}
      value={val}
      onSelect={() => onSelect(val)}
      className={cn(indent && "pl-11", value === val && "bg-accent")}
    >
      <span className="flex-1">{label}</span>
      {value === val ? <Check className="size-4" aria-hidden /> : null}
    </CommandItem>
  );
  return (
    <Command>
      <p className="px-3 pt-3 pb-1 text-xs text-muted-foreground">
        Doar portalurile activate pentru agenția ta.
      </p>
      <CommandList className="max-h-96">
        <CommandGroup>{item("all", "Oricare")}</CommandGroup>
        <CommandGroup heading="Toate portalurile">
          {BUCKETS.map((b) => item(`any:${b}`, ANY_LABELS[b]))}
        </CommandGroup>
        {options.map((o) => (
          <CommandGroup
            key={o.portalId}
            data-portal-group={o.portalId}
            heading={
              <span className="flex items-center gap-2 text-sm font-semibold normal-case text-foreground">
                <PortalLogoStack portalId={o.portalId} name={o.name} size={28} />
                {o.name}
              </span>
            }
          >
            {BUCKETS.map((b) => item(`${o.portalId}:${b}`, bucketLabel(b, o.pushSupported), true))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
