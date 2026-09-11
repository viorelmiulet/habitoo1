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
import imobiliareRoLogo from "@/assets/portals/imobiliare_ro.png";
import imospotLogo from "@/assets/portals/imospot.png";
import imoveLogo from "@/assets/portals/imove.png";
import oferteImobiliareLogo from "@/assets/portals/oferteimobiliare.png";
import olxLogo from "@/assets/portals/olx.png";
import publi24Logo from "@/assets/portals/publi24.png";
import romimoLogo from "@/assets/portals/romimo.png";
import storiaLogo from "@/assets/portals/storia.png";
import { portalLogoIds } from "@/lib/portals/registry";
import { cn } from "@/lib/utils";

const PORTAL_LOGOS: Record<string, string> = {
  clickimob: clickimobLogo,
  imove: imoveLogo,
  imospot: imospotLogo,
  homepitch: homepitchLogo,
  oferteimobiliare: oferteImobiliareLogo,
  imobiliare_ro: imobiliareRoLogo,
  storia: storiaLogo,
  olx: olxLogo,
  publi24: publi24Logo,
  romimo: romimoLogo,
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

/**
 * Logo-urile unei intrări de portal. Pentru perechile acoperite de o singură
 * integrare (ex. Storia + OLX) se afișează ambele logo-uri pe același rând.
 */
export function PortalLogoStack({
  portalId,
  name,
  size = 32,
  className,
}: {
  portalId: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const ids = portalLogoIds(portalId);
  if (ids.length === 1) {
    return <PortalLogo portalId={portalId} name={name} size={size} className={className} />;
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {ids.map((id) => (
        <PortalLogo key={id} portalId={id} name={name} size={size} />
      ))}
    </span>
  );
}
