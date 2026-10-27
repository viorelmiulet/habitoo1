import { useMemo, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { geographyKey } from "@/lib/private-listing-geography";
import { parsePlaceChoices, placeToken, serializePlaces, type SearchPlaceOption } from "@/lib/search-places";

type Props = { options: SearchPlaceOption[]; value: string; onApply: (value: string) => void };
export function SearchPlacesPicker({ options, value, onApply }: Props) {
  const [open,setOpen] = useState(false), [query,setQuery] = useState(""), [picked,setPicked] = useState<string[]>([]);
  const selected = parsePlaceChoices(value).map(placeToken);
  const byToken = new Map(options.map(o => [o.value,o]));
  const visible = useMemo(() => options.filter(o => geographyKey(o.label).includes(geographyKey(query))),[options,query]);
  const apply = (tokens: string[]) => onApply(serializePlaces(tokens.flatMap(t => parsePlaceChoices(`[${t}]`))));
  return <div className="min-w-0 space-y-2">
    <Button type="button" variant="outline" aria-label="Localități și zone" aria-haspopup="dialog" className="w-full justify-start font-normal" onClick={() => {setPicked(selected);setQuery("");setOpen(true);}}><MapPin className="size-4 shrink-0"/><span className="truncate">Localități și zone</span>{selected.length > 0 && <span className="ml-auto text-muted-foreground">{selected.length}</span>}</Button>
    {selected.length > 0 && <div className="flex flex-wrap gap-1" aria-label="Localități și zone selectate">{selected.map(t => {const c = parsePlaceChoices(`[${t}]`)[0]; const label = byToken.get(t)?.label ?? (c ? c.zone || c.city || c.county : t); return <span key={t} className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted px-2 py-1 text-xs"><span className="min-w-0 break-words">{label}</span><Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`Șterge ${label}`} onClick={() => apply(selected.filter(x => x !== t))}><X className="size-3"/></Button></span>;})}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent aria-describedby={undefined} className="flex h-dvh max-h-dvh w-screen max-w-none flex-col rounded-none p-4 sm:h-[min(80dvh,720px)] sm:w-full sm:max-w-2xl sm:rounded-lg"><DialogHeader className="shrink-0 pr-8"><DialogTitle>Localități și zone</DialogTitle></DialogHeader><div className="relative shrink-0"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input autoFocus aria-label="Caută localități și zone" placeholder="Caută după nume" className="pl-9" value={query} onChange={e => setQuery(e.target.value)}/></div><div className="min-h-0 flex-1 overflow-y-auto">{visible.map(o => <label key={o.value} className="flex cursor-pointer items-center gap-3 border-b border-border py-3 text-sm"><Checkbox aria-label={o.label} checked={picked.includes(o.value)} onCheckedChange={() => setPicked(p => p.includes(o.value) ? p.filter(t => t !== o.value) : [...p,o.value])}/><span className="min-w-0 break-words">{o.label}</span><span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{o.count}</span></label>)}{!visible.length && <p className="py-6 text-sm text-muted-foreground">Niciun rezultat</p>}</div><div className="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-3"><Button type="button" variant="ghost" onClick={() => setPicked([])}>Șterge selecția</Button><Button type="button" onClick={() => {apply(picked);setOpen(false);}}>Aplică{picked.length ? ` (${picked.length})` : ""}</Button></div></DialogContent></Dialog>
  </div>;
}
