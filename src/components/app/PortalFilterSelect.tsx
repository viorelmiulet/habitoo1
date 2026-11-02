/** Shared read-only multi-select for the property panel and list toolbar. */
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { PORTAL_BUCKET_LABELS, parsePortalFilter, type PortalFilterBucket } from "@/lib/portals/portal-state";
import { unifiedPortalValues, serializePortalValues, togglePromotionValue, promotionFilterLabel, type PromotionFilterGroup } from "@/lib/portals/promotion-filter";
import { cn } from "@/lib/utils";
export type PortalFilterOption = { portalId: string; name: string; pushSupported: boolean };
const BUCKETS: PortalFilterBucket[] = ["published", "unpublished", "error"];
const ANY_LABELS: Record<PortalFilterBucket, string> = {
  published: "Publicate pe cel puțin un portal",
  unpublished: "Nepublicate pe niciun portal",
  error: "Cu erori pe cel puțin un portal",
};
export function bucketLabel(bucket: PortalFilterBucket, _pushSupported: boolean) { return PORTAL_BUCKET_LABELS[bucket]; }
export function portalFilterLabel(value: string, options: PortalFilterOption[], groups: PromotionFilterGroup[] = []): string {
  const values = unifiedPortalValues(value);
  const first = values[0];
  if (!first) return "Oricare";
  const state = parsePortalFilter(first);
  const option = options.find((o) => o.portalId === state?.portal);
  const label = state ? state.portal === "any" ? ANY_LABELS[state.state] : `${state.state === "error" ? "Erori" : PORTAL_BUCKET_LABELS[state.state]} · ${groups.find((g) => g.portalId === state.portal)?.chipName ?? option?.name ?? state.portal}` : promotionFilterLabel(first, groups);
  return values.length > 1 ? `${label} +${values.length - 1}` : label;
}
type ListProps = {
  value: string;
  options: PortalFilterOption[];
  onSelect: (value: string) => void;
  promotionValue?: string;
  promotionGroups?: PromotionFilterGroup[];
  onReset?: () => void;
};
export function PortalFilterSelect({ value, options, onChange, promotionValue = "", promotionGroups = [], onReset, className, id }: Omit<ListProps, "onSelect"> & { onChange: (value: string) => void; className?: string; id?: string }) {
  const [open, setOpen] = useState(false);
  const merged = serializePortalValues(unifiedPortalValues(value, promotionValue));
  const first = unifiedPortalValues(merged)[0];
  const selectedPortal = options.find((o) => o.portalId === first?.split(":")[0]);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="outline" id={id} role="combobox" aria-expanded={open} aria-label="Portaluri" className={cn("w-72 justify-between gap-2 font-normal", className)}>
      <span className="flex min-w-0 items-center gap-2">
        {selectedPortal ? <PortalLogoStack portalId={selectedPortal.portalId} name={selectedPortal.name} size={22} /> : null}
        <span className="truncate">{portalFilterLabel(merged, options, promotionGroups)}</span>
      </span><ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
    </Button></PopoverTrigger>
    <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] rounded-[12px] p-0" align="start">
      <PortalFilterOptionsList value={merged} options={options} promotionGroups={promotionGroups} onSelect={onChange} onReset={onReset} />
    </PopoverContent>
  </Popover>;
}
export function PortalFilterOptionsList({ value, options, onSelect, promotionValue = "", promotionGroups = [], onReset }: ListProps) {
  const selected = unifiedPortalValues(value, promotionValue);
  const ordered = [
    ...promotionGroups.map((g) => options.find((o) => o.portalId === g.portalId) ?? { portalId: g.portalId, name: g.portalName, pushSupported: true }),
    ...options.filter((o) => !promotionGroups.some((g) => g.portalId === o.portalId)),
  ].filter((o) => o.portalId !== "facebook_catalog");
  const item = (val: string, label: string, indent = false) => {
    const checked = val === "all" ? selected.length === 0 : selected.includes(val);
    return <CommandItem key={val} value={val} aria-label={label} data-checked={checked} onSelect={() => {
      if (val === "all") { if (onReset) onReset(); else onSelect("all"); }
      else onSelect(serializePortalValues(togglePromotionValue(selected, val)));
    }} className={cn("min-h-11", indent && "pl-11", checked && "bg-accent")}>
      <span className="flex-1">{label}</span>{checked ? <Check className="size-4" aria-hidden /> : null}
    </CommandItem>;
  };
  return <Command tabIndex={0}><CommandList className="max-h-[min(32rem,60dvh)]">
    <CommandGroup>{item("all", "Oricare")}</CommandGroup>
    <CommandGroup heading="Toate portalurile">
      {BUCKETS.map((b) => item(`any:${b}`, ANY_LABELS[b]))}
      {item("any", "Orice promovare")}{item("none", "Fără promovare")}
    </CommandGroup>
    {ordered.map((o) => { const group = promotionGroups.find((g) => g.portalId === o.portalId); return <CommandGroup key={o.portalId} data-portal-group={o.portalId} heading={<span className="flex items-center gap-2 text-sm font-semibold normal-case text-foreground"><PortalLogoStack portalId={o.portalId} name={o.name} size={28} />{group?.portalName ?? o.name}</span>}>
      {BUCKETS.map((b) => item(`${o.portalId}:${b}`, bucketLabel(b, o.pushSupported), true))}
      {group?.options.filter((option) => !option.value.endsWith(":error")).map((option) => item(option.value, option.label, true))}
    </CommandGroup>; })}
  </CommandList></Command>;
}
