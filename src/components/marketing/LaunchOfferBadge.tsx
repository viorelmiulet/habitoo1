import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type LaunchOffer = { text: string; endDate?: string };

/** Oferta rămâne ascunsă până când textul ei este furnizat. */
export const LAUNCH_OFFER: LaunchOffer | null = null;

export function LaunchOfferBadge({
  offer = LAUNCH_OFFER,
  className,
}: {
  offer?: LaunchOffer | null;
  className?: string;
}) {
  if (!offer) return null;

  return (
    <div className={cn("mx-auto w-full max-w-3xl rounded-xl border border-gold/30 bg-gold/10 px-5 py-4 text-center text-navy", className)}>
      <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold-dark">
        <Star aria-hidden="true" className="size-4" />
        <span>OFERTĂ DE LANSARE</span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium sm:text-base">{offer.text}</p>
      {offer.endDate ? <p className="mt-1 text-xs text-muted-foreground">Până la {offer.endDate}</p> : null}
    </div>
  );
}