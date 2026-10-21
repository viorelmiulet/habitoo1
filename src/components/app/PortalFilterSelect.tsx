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
import { parsePromotionValues, promotionFilterLabel, serializePromotionValues, togglePromotionValue } from "./PromotionFilterSelect";
import { PROMOTION_FILTER_ANY, PROMOTION_FILTER_NONE, type PromotionFilterGroup } from "@/lib/portals/promotion-filter";

export type PortalFilterOption = { portalId: string; name: string; pushSupported: boolean };

const BUCKETS: PortalFilterBucket[] = ["published", "unpublished", "error"];
const ANY_LABELS: Record<PortalFilterBucket, string> = {
  published: "Publicate pe cel puțin un portal",
  unpublished: "Nepublicate pe niciun portal",
  error: "Cu erori pe cel puțin un portal",
};

export function bucketLabel(bucket: PortalFilterBucket, pushSupported: boolean) {
  return PORTAL_BUCKET_LABELS[bucket];
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
  promotionValue = "",
  promotionGroups = [],
  onPromotionChange,
  onReset,
  className,
  id,
}: {
  value: string;
  options: PortalFilterOption[];
  onChange: (value: string) => void;
  promotionValue?: string;
  promotionGroups?: PromotionFilterGroup[];
  onPromotionChange?: (value: string) => void;
  onReset?: () => void;
  className?: string;
  id?: string;
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
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-label="Publicare pe portaluri"
          className={cn("w-72 justify-between gap-2 font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedPortal ? (
              <PortalLogoStack portalId={selectedPortal.portalId} name={selectedPortal.name} size={22} />
            ) : null}
            <span className="truncate">{[
              value !== "all" ? portalFilterLabel(value, options) : "",
              promotionValue ? promotionFilterLabel(promotionValue, promotionGroups) : "",
            ].filter(Boolean).join(" · ") || "Oricare"}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-0" align="start">
        <PortalFilterOptionsList
          value={value}
          options={options}
          promotionValue={promotionValue}
          promotionGroups={promotionGroups}
          onPromotionChange={onPromotionChange}
          onReset={onReset ? () => { onReset(); setOpen(false); } : undefined}
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
  promotionValue = "",
  promotionGroups = [],
  onPromotionChange,
  onReset,
}: {
  value: string;
  options: PortalFilterOption[];
  onSelect: (value: string) => void;
  promotionValue?: string;
  promotionGroups?: PromotionFilterGroup[];
  onPromotionChange?: (value: string) => void;
  onReset?: () => void;
}) {
  const selectedPromotions = parsePromotionValues(promotionValue);
  const promotionItem = (val: string, label: string, indent = false) => (
    <CommandItem
      key={`promotion:${val}`}
      value={`promotion:${val}`}
      onSelect={() => onPromotionChange?.(serializePromotionValues(togglePromotionValue(selectedPromotions, val)))}
      className={cn("min-h-11", indent && "pl-11", selectedPromotions.includes(val) && "bg-accent")}
      aria-label={label}
    >
      <span className="flex-1">{label}</span>
      {selectedPromotions.includes(val) ? <Check className="size-4" aria-hidden /> : null}
    </CommandItem>
  );
  const item = (val: string, label: string, indent = false) => (
    <CommandItem
      key={val}
      value={val}
      onSelect={() => val === "all" && onReset ? onReset() : onSelect(val)}
      className={cn("min-h-11", indent && "pl-11", value === val && !(val === "all" && promotionValue) && "bg-accent")}
    >
      <span className="flex-1">{label}</span>
      {value === val && !(val === "all" && promotionValue) ? <Check className="size-4" aria-hidden /> : null}
    </CommandItem>
  );
  return (
    <Command tabIndex={0}>
      <CommandList className="max-h-[min(32rem,60dvh)]">
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
            {onPromotionChange ? promotionGroups.find((group) => group.portalId === o.portalId)?.options.map((option) => promotionItem(option.value, option.label, true)) : null}
          </CommandGroup>
        ))}
        {onPromotionChange && promotionGroups.length > 0 ? (
          <CommandGroup heading="Promovări" className="border-t border-border">
            {promotionItem(PROMOTION_FILTER_ANY, "Orice promovare")}
            {promotionItem(PROMOTION_FILTER_NONE, "Fără promovare")}
          </CommandGroup>
        ) : null}
      </CommandList>
    </Command>
  );
}
