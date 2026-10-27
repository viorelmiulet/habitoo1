import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Phone } from "lucide-react";
import type { OwnerListing } from "@/lib/listings.functions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import facebookLogo from "@/assets/portals/facebook.svg";
import imobiliareLogo from "@/assets/portals/imobiliare_ro.png";
import olxLogo from "@/assets/portals/olx.png";
import romimoLogo from "@/assets/portals/romimo.png";
import storiaLogo from "@/assets/portals/storia.png";

const SOURCE_ICONS: Record<string, string> = {
  storia: storiaLogo,
  olx: olxLogo,
  imobiliare: imobiliareLogo,
  romimo: romimoLogo,
  facebook: facebookLogo,
};
const SOURCE_TOKENS: Record<string, string> = { imoradar: "IR", anuntul: "AN", homezz: "HZ" };

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
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-3 font-medium">Imagine</th>
            <th className="p-3 font-medium">Tip proprietate / Caracteristici</th>
            <th className="p-3 font-medium">Zile piață / Ultima modif.</th>
            <th className="p-3 font-medium">Locație</th>
            <th className="p-3 font-medium">Preț</th>
            <th className="p-3 font-medium">Sursa</th>
            <th className="p-3 font-medium">Operațiuni</th>
          </tr>
        </thead>
        <tbody>
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
              <tr
                key={l.id}
                onClick={() => open(l.id)}
                className="cursor-pointer border-t border-border even:bg-muted/30 hover:bg-primary/5"
              >
                <td className="p-3">
                  {l.images[0] ? (
                    <img src={l.images[0]} alt="" loading="lazy" className="h-[70px] w-[100px] rounded-md object-cover" />
                  ) : (
                    <div className="h-[70px] w-[100px] rounded-md bg-muted" />
                  )}
                </td>
                <td className="max-w-64 p-3">
                  <div className="font-semibold">{listingHeadline(l)}</div>
                  {specs.length ? <div className="text-xs text-muted-foreground">{specs.join(" · ")}</div> : null}
                </td>
                <td className="whitespace-nowrap p-3">
                  {listingAge(l.firstSeenAt) ? (
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ageTone(l.firstSeenAt)}`}>
                      {listingAge(l.firstSeenAt)}
                    </span>
                  ) : null}
                  {updated ? <div className="mt-1 text-xs text-muted-foreground">{fmtDate(updated)}</div> : null}
                </td>
                <td className="max-w-56 p-3">{place || "—"}</td>
                <td className="whitespace-nowrap p-3">
                  {l.price === null ? (
                    <span className="text-muted-foreground">Preț nedisponibil</span>
                  ) : (
                    <>
                      <div className="text-base font-bold">
                        {fmtNum(l.price)} {cur(l.currency)}{rent ? (perDay ? " / zi" : " / lună") : ""}
                      </div>
                      {!rent && ppm ? <div className="text-xs text-muted-foreground">{fmtNum(ppm)} {cur(l.currency)}/mp</div> : null}
                    </>
                  )}
                </td>
                <td className="p-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded bg-background text-[10px] font-bold" aria-label={label}>
                        {SOURCE_ICONS[l.source] ? (
                          <img src={SOURCE_ICONS[l.source]} alt={label} className="size-7 object-contain" />
                        ) : (
                          SOURCE_TOKENS[l.source] ?? label.slice(0, 2).toUpperCase()
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                </td>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
