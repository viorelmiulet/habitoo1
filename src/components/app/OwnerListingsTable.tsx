import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Phone } from "lucide-react";
import type { OwnerListing } from "@/lib/listings.functions";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ListingSourcePill } from "@/components/app/ListingSourcePill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function typeLabel(t: string | null) {
  const v = (t ?? "").toLowerCase();
  if (/garson|studio/.test(v)) return "Garsonieră";
  if (/apart/.test(v)) return "Apartament";
  if (/cas|vil/.test(v)) return "Casă/Vilă";
  if (/teren/.test(v)) return "Teren";
  if (/birou|comerc|spa/.test(v)) return "Spațiu comercial";
  return t?.trim() || "Proprietate";
}

export function listingHeadline(l: OwnerListing): string {
  const rent = l.transactionType ? /rent|inch/i.test(l.transactionType) : false;
  const rooms = l.rooms !== null && l.rooms > 0 ? ` cu ${l.rooms} ${l.rooms === 1 ? "cameră" : "camere"}` : "";
  return `${typeLabel(l.propertyType)}${rooms} ${rent ? "de închiriat" : "de vânzare"}`;
}

export function listingAge(fromIso: string | null, now = Date.now()): string | null {
  if (!fromIso) return null;
  const min = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000));
  if (min < 60) return `${min} ${min === 1 ? "minut" : "minute"}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${h === 1 ? "oră" : "ore"}`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "zi" : "zile"}`;
}

const fmtNum = (n: number) => new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(n);
const cur = (c: string | null) => (!c || c.toUpperCase() === "EUR" ? "€" : c.toUpperCase() === "RON" ? "lei" : c);
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}`;
};

function ageTone(iso: string | null) {
  if (!iso) return "bg-muted text-muted-foreground";
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 24) return "bg-primary/15 text-primary";
  if (h < 24 * 7) return "bg-accent text-accent-foreground";
  return "bg-muted text-muted-foreground";
}

export function OwnerListingsTable({ items, sourceLabels }: { items: OwnerListing[]; sourceLabels: Record<string, string> }) {
  const navigate = useNavigate();
  const open = (id: string) => navigate({ to: "/app/anunturi-particulari/$id", params: { id } });
  return (
    <TooltipProvider delayDuration={200}>
    <div className="overflow-hidden rounded-[14px] border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Imagine</TableHead>
            <TableHead>Tip proprietate / Caracteristici</TableHead>
            <TableHead>Zile piață / Ultima modif.</TableHead>
            <TableHead>Locație</TableHead>
            <TableHead>Preț</TableHead>
            <TableHead>Sursa</TableHead>
            <TableHead>Operațiuni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((l) => {
            const specs = [
              l.surface !== null ? `S.U. ${fmtNum(l.surface)} mp` : null,
              l.floor ? `et. ${l.floor}` : null,
              l.yearBuilt ? String(l.yearBuilt) : null,
            ].filter(Boolean);
            const rent = l.transactionType ? /rent|inch/i.test(l.transactionType) : false;
            const perDay = l.transactionType ? /pe zi|day/i.test(l.transactionType) : false;
            const ppm = l.pricePerM2 ?? (l.price !== null && l.surface ? l.price / l.surface : null);
            const place = [l.zone, l.city ?? l.location, l.county].filter(Boolean).join(", ");
            const label = sourceLabels[l.source] ?? l.source;
            const updated = l.scrapedAt ?? l.firstSeenAt;
            return (
              <TableRow
                key={l.id}
                onClick={() => open(l.id)}
                className="h-[52px] cursor-pointer"
              >
                <TableCell>
                  {l.images[0] ? (
                    <img referrerPolicy="no-referrer" src={l.images[0]} alt="" loading="lazy" className="h-[70px] w-[100px] rounded-[10px] object-cover" />
                  ) : (
                    <div className="h-[70px] w-[100px] rounded-[10px] bg-muted" />
                  )}
                </TableCell>
                <TableCell className="max-w-64">
                  <div className="font-semibold">{listingHeadline(l)}</div>
                  {specs.length ? <div className="text-xs text-muted-foreground">{specs.join(" · ")}</div> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {listingAge(l.firstSeenAt) ? (
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ageTone(l.firstSeenAt)}`}>
                      {listingAge(l.firstSeenAt)}
                    </span>
                  ) : null}
                  {updated ? <div className="mt-1 text-xs text-muted-foreground">{fmtDate(updated)}</div> : null}
                </TableCell>
                <TableCell className="max-w-56">{place || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {l.price === null ? (
                    <span className="text-muted-foreground">Preț nedisponibil</span>
                  ) : (
                    <>
                      <div className="text-base font-extrabold">
                        {fmtNum(l.price)} {cur(l.currency)}{rent ? (perDay ? " / zi" : " / lună") : ""}
                      </div>
                      {!rent && ppm ? <div className="text-xs text-muted-foreground">{fmtNum(ppm)} {cur(l.currency)}/mp</div> : null}
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <ListingSourcePill source={l.source} label={label} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col items-start gap-1">
                    <Button size="sm" className="h-7" onClick={() => open(l.id)}>Detalii</Button>
                    {l.phone ? (
                      <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Phone className="size-3" /> {l.phone}
                      </a>
                    ) : null}
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Anunțul original <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
    </TooltipProvider>
  );
}
