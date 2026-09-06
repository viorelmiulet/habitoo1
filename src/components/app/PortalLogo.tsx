/**
 * Logo-ul unui portal imobiliar, cu fallback la tokenul text din registry.
 *
 * Imaginile sunt assets locale (nu hotlink către site-urile portalurilor).
 * Dacă un portal nu are logo local sau imaginea nu se încarcă, se afișează
 * inițialele definite în `registry.ts`.
 */
import { useState } from "react";
import clickimobLogo from "@/assets/portals/clickimob.png";
import homepitchLogo from "@/assets/portals/homepitch.png";
import imospotLogo from "@/assets/portals/imospot.png";
import imoveLogo from "@/assets/portals/imove.png";
import { cn } from "@/lib/utils";

const PORTAL_LOGOS: Record<string, string> = {
  clickimob: clickimobLogo,
  imove: imoveLogo,
  imospot: imospotLogo,
  homepitch: homepitchLogo,
};

/** Există logo local pentru portalul dat? */
export function hasPortalLogo(portalId: string): boolean {
  return Boolean(PORTAL_LOGOS[portalId]);
}

type Props = {
  portalId: string;
  /** Nume afișat, folosit pentru alt text. */
  name: string;
  /** Token text de rezervă (ex. "HP"). */
  fallback?: string;
  /** Latura pătratului, în px. */
  size?: number;
  className?: string;
};

export function PortalLogo({ portalId, name, fallback, size = 32, className }: Props) {
  const [failed, setFailed] = useState(false);
  const src = PORTAL_LOGOS[portalId];
  const initials = fallback ?? name.slice(0, 2).toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white",
        !src || failed ? "bg-muted text-[0.7rem] font-semibold text-foreground" : null,
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
      title={name}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="size-full object-contain p-0.5"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
