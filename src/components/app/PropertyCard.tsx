import type React from "react";
/**
 * Cardul de proprietate din grila listei, în stilul „Proprietăți recente" de pe
 * dashboard. Prezentare doar: nu conține logică de business, primește datele și
 * acțiunile din pagina listei.
 */
import { Link } from "@tanstack/react-router";
import { Bath, BedDouble, Building, Ruler, Star } from "lucide-react";

import { PortalLogoLinks } from "@/components/app/properties/PortalLogoLinks";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PropertyThumb, type PropertyCover } from "@/components/app/PropertyThumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatMoney, formatNumber } from "@/lib/format";
import {
  propertyStatusLabels,
  propertyStatusTone,
  propertyTypeLabels,
  transactionLabels,
} from "@/lib/labels";
import type { PropertyPortalCell } from "@/lib/portals.functions";
import { cn } from "@/lib/utils";
import { DevelopmentBadge } from "@/components/app/developments/DevelopmentBadge";

export type PropertyCardRow = {
  id: string;
  title: string;
  reference: string | null;
  status: keyof typeof propertyStatusLabels;
  property_type: string;
  transaction_kind: keyof typeof transactionLabels;
  price: number | null;
  currency: string | null;
  surface: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  city: string | null;
  district: string | null;
  features?: string[] | null;
  development_id?: string | null;
  created_at: string;
  tags: string[] | null;
};

const NEW_DAYS = 7;

/** Badge-ul din colțul imaginii: un singur badge, în ordinea de importanță. */
function cornerBadge(p: PropertyCardRow): { label: string; tone: string } | null {
  if (p.status === "reserved")
    return { label: "Rezervat", tone: "bg-warning text-gold-foreground" };
  const exclusive = (p.tags ?? []).some((t) => t.toLowerCase().includes("exclusiv"));
  if (exclusive) return { label: "Exclusivitate", tone: "bg-primary text-primary-foreground" };
  const ageDays = (Date.now() - new Date(p.created_at).getTime()) / 86_400_000;
  if (ageDays <= NEW_DAYS) return { label: "Nou", tone: "bg-success text-success-foreground" };
  return null;
}

export function PropertyCard({
  property,
  cover,
  favorite,
  onToggleFavorite,
  selected,
  onSelectedChange,
  portalCells,
  developmentName,
  cloneMarks,
}: {
  property: PropertyCardRow;
  developmentName?: string | null | undefined;
  cloneMarks?: React.ReactNode;
  cover: PropertyCover;
  favorite: boolean;
  onToggleFavorite: () => void;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
  portalCells: PropertyPortalCell[];
}) {
  const badge = cornerBadge(property);
  const activePortals = portalCells.filter((c) => c.selected);

  const facts = [
    property.surface ? { icon: Ruler, text: `${formatNumber(property.surface)} m²` } : null,
    property.rooms ? { icon: BedDouble, text: `${property.rooms} cam.` } : null,
    property.bathrooms ? { icon: Bath, text: `${property.bathrooms} băi` } : null,
    property.floor !== null && property.floor !== undefined
      ? { icon: Building, text: `Etaj ${property.floor}` }
      : null,
  ].filter(Boolean) as { icon: typeof Ruler; text: string }[];

  return (
    <article data-property-row className="group flex min-w-0 flex-col overflow-hidden rounded-[14px] bg-card ring-1 ring-border transition-shadow hover:shadow-soft">
      <div data-property-photo className="relative">
        <PropertyThumb
          propertyId={property.id}
          title={property.title}
          cover={cover}
          className="aspect-[1.82/1] w-full rounded-none border-0"
        />
        {badge ? (
          <span
            className={cn(
              "absolute top-2.5 left-2.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              badge.tone,
            )}
          >
            {badge.label}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleFavorite}
          title={favorite ? "Scoate din favorite" : "Adaugă la favorite"}
          aria-label={favorite ? "Scoate din favorite" : "Adaugă la favorite"}
          className="absolute top-2.5 right-2.5 size-8 rounded-full bg-card/90 text-muted-foreground shadow-sm backdrop-blur hover:bg-card hover:text-primary"
        >
          <Star className={cn("size-4", favorite && "fill-primary text-primary")} />
        </Button>
        <span className="absolute bottom-2.5 left-2.5">
          <Checkbox
            checked={selected}
            onCheckedChange={(c) => onSelectedChange(c === true)}
            aria-label={`Selectează ${property.title}`}
            className="bg-card/90 backdrop-blur"
          />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {property.reference ? `${property.reference} · ` : ""}
            {propertyTypeLabels[property.property_type] ?? property.property_type}
          </p>
          <Link
            to="/app/properties/$id"
            params={{ id: property.id }}
            className="mt-0.5 line-clamp-1 font-semibold hover:text-primary"
          >
            {property.title}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[property.district, property.city].filter(Boolean).join(", ") ||
              "Locație nespecificată"}
          </p>
          {property.development_id ? <div className="mt-1"><DevelopmentBadge id={property.development_id} name={developmentName} /></div> : null}
          {cloneMarks}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={propertyStatusTone[property.status]} dot>
              {propertyStatusLabels[property.status]}
            </StatusBadge>
            <span className={cn("rounded-pill px-2.5 py-0.5 text-xs font-bold", property.transaction_kind === "rent" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{transactionLabels[property.transaction_kind]}</span>
          </div>
          <p className="shrink-0 text-[18px] font-extrabold">
            {formatMoney(property.price, property.currency)}
          </p>
        </div>

        {facts.length > 0 ? (
          <div className="grid grid-cols-2 gap-1.5">
            {facts.map((f) => (
              <span
                key={f.text}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground"
              >
                <f.icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{f.text}</span>
              </span>
            ))}
          </div>
        ) : null}

        {(property.features ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {(property.features ?? []).slice(0, 3).map((f) => (
              <span
                key={f}
                className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>
        ) : null}

        {activePortals.length > 0 ? (
          <div className="mt-auto min-w-0 pt-1">
            <PortalLogoLinks cells={activePortals} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
