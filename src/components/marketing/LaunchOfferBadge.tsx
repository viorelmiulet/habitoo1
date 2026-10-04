import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type LaunchOffer = { text: string; endDate?: string };

/** Oferta activă; `null` ascunde banda. */
export const LAUNCH_OFFER: LaunchOffer | null = { text: "Profită de oferta de lansare" };

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
      <div className="flex items-center justify-center gap-2 text-base font-semibold sm:text-lg">
        <Star aria-hidden="true" className="size-4 shrink-0" />
        <span>{offer.text}</span>
      </div>
      {offer.endDate ? <p className="mt-1 text-xs text-muted-foreground">Până la {offer.endDate}</p> : null}
    </div>
  );
}