import { Building2, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, formatNumber } from "@/lib/format";
import { propertyTypeLabels, transactionLabels } from "@/lib/labels";
import type { CollaborationOffer } from "@/lib/collaboration.functions";
import type { PartnerOfferView } from "@/lib/partner-offers";
import { cn } from "@/lib/utils";

export function PartnerOfferItem({ offer, view, onDetails, onPropose }: {
  offer: CollaborationOffer; view: PartnerOfferView;
  onDetails: (offer: CollaborationOffer) => void; onPropose: (offer: CollaborationOffer) => void;
}) {
  const compact = view === "list";
  const location = [offer.district, offer.city, offer.county].filter(Boolean).join(", ") || "Locație nespecificată";
  const facts = [propertyTypeLabels[offer.propertyType] ?? offer.propertyType,
    transactionLabels[offer.transactionKind as "sale" | "rent"],
    offer.rooms ? `${offer.rooms} camere` : null,
    offer.surface ? `${formatNumber(offer.surface)} m²` : null].filter(Boolean).join(" · ");
  return <li className={cn("min-w-0 overflow-hidden bg-card", compact ? "grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-border py-3 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center" : "flex flex-col rounded-lg border border-border")}>
    <Button variant="ghost" onClick={() => onDetails(offer)} aria-label={`Detalii ${offer.title}`} className={cn("relative block overflow-hidden rounded-none bg-muted p-0 hover:bg-muted", compact ? "h-20 w-full rounded-md sm:h-24" : "aspect-[1.82/1] h-auto w-full")}>
      {offer.coverUrl ? <img src={offer.coverUrl} alt={offer.title} loading="lazy" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-muted-foreground"><ImageOff className="size-5" aria-hidden /></span>}
      {!compact && offer.collabCommissionPercent !== null ? <span className="absolute top-3 left-3 rounded-full bg-gold px-3 py-1 text-sm font-semibold text-gold-foreground">{offer.collabCommissionPercent}% comision</span> : null}
    </Button>
    <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5", !compact && "p-3.5")}>
      <div className={cn(compact && "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2")}>
        <h3 className={cn("min-w-0 text-sm font-semibold", compact ? "line-clamp-2" : "line-clamp-2")}>{offer.title}</h3>
        {compact ? <p className="shrink-0 text-sm font-semibold">{formatMoney(offer.price, offer.currency)}</p> : null}
      </div>
      <p className="truncate text-xs text-muted-foreground" title={location}>{location}</p>
      {!compact ? <p className="text-lg font-semibold">{formatMoney(offer.price, offer.currency)}</p> : null}
      <p className="text-xs text-muted-foreground">{facts}</p>
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={offer.agencyName}>
        {offer.agencyLogoUrl ? <img src={offer.agencyLogoUrl} alt={`Logo ${offer.agencyName}`} width="18" height="18" loading="lazy" className="size-[18px] shrink-0 object-contain" /> : <Building2 className="size-3.5 shrink-0" aria-hidden />}
        <span className="truncate">{offer.agencyName}</span>
      </p>
      {compact && offer.collabCommissionPercent !== null ? <span className="text-xs font-semibold text-primary">{offer.collabCommissionPercent}% comision</span> : null}
      {!compact ? <OfferActions offer={offer} onDetails={onDetails} onPropose={onPropose} /> : null}
    </div>
    {compact ? <div className="col-span-2 min-w-0 sm:col-span-1 sm:w-52"><OfferActions offer={offer} onDetails={onDetails} onPropose={onPropose} /></div> : null}
  </li>;
}

function OfferActions({ offer, onDetails, onPropose }: { offer: CollaborationOffer; onDetails: (o: CollaborationOffer) => void; onPropose: (o: CollaborationOffer) => void }) {
  return <div className="mt-auto min-w-0 pt-2">
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
      <Button size="sm" variant="outline" onClick={() => onDetails(offer)}>Detalii</Button>
      <Button size="sm" className="min-w-0 px-2 text-xs" onClick={() => onPropose(offer)}>Propune unui client</Button>
    </div>
    <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">{offer.myProposalCount > 0 ? `${offer.myProposalCount} propunere(i) trimise` : "Nicio propunere trimisă"}</p>
  </div>;
}