import facebookAsset from "@/assets/facebook-brand.svg.asset.json";
import argusAsset from "@/assets/argus-official.png.asset.json";
import imobiliareLogo from "@/assets/portals/imobiliare_ro.png";
import olxLogo from "@/assets/portals/olx.png";
import romimoLogo from "@/assets/portals/romimo.png";
import storiaLogo from "@/assets/portals/storia.png";
import imoradarLogo from "@/assets/portals/imoradar.png";
import anuntulLogo from "@/assets/portals/anuntul.png";
import homezzLogo from "@/assets/portals/homezz.png";
import { HabitooMapIcon } from "@/components/brand/HabitooMapIcon";
import { cn } from "@/lib/utils";

const SOURCE_LOGOS: Record<string, string> = {
  storia: storiaLogo,
  olx: olxLogo,
  imobiliare: imobiliareLogo,
  romimo: romimoLogo,
  imoradar: imoradarLogo,
  anuntul: anuntulLogo,
  homezz: homezzLogo,
  facebook: facebookAsset.url,
  argus: argusAsset.url,
};

export type ListingSourceLogo = { kind: "habitoo" } | { kind: "image"; src: string } | { kind: "none" };

/** Logo-ul real al sursei; iconul MAP Habitoo doar pentru sursa Habitoo; altfel doar numele. */
export function listingSourceLogo(source: string): ListingSourceLogo {
  if (source === "habitoo") return { kind: "habitoo" };
  const src = SOURCE_LOGOS[source];
  return src ? { kind: "image", src } : { kind: "none" };
}

export function ListingSourceLogoMark({ source, className }: { source: string; className?: string }) {
  const logo = listingSourceLogo(source);
  if (logo.kind === "habitoo") return <HabitooMapIcon />;
  if (logo.kind === "image") return <img src={logo.src} alt="" className={cn("size-3.5 shrink-0 object-contain", className)} />;
  return null;
}

export function ListingSourcePill({ source, label, className }: { source: string; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-xs font-semibold text-foreground", className)}>
      <ListingSourceLogoMark source={source} />
      <span className="truncate">{label}</span>
    </span>
  );
}
