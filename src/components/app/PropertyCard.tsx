/**
 * Cardul de proprietate din grila listei, în stilul „Proprietăți recente" de pe
 * dashboard. Prezentare doar: nu conține logică de business, primește datele și
 * acțiunile din pagina listei.
 */
import { Link } from "@tanstack/react-router";
import { Bath, BedDouble, Building, Ruler, Star } from "lucide-react";

import { PortalLogo } from "@/components/app/PortalLogo";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PropertyThumb, type PropertyCover } from "@/components/app/PropertyThumb";
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
  created_at: string;
  tags: string[] | null;
};

const NEW_DAYS = 7;

/** Badge-ul din colțul imaginii: un singur badge, în ordinea de importanță. */
function cornerBadge(p: PropertyCardRow): { label: string; tone: string } | null {
  if (p.status === "reserved")
    return { label: "Rezervat", tone: "bg-warning text-warning-foreground" };
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
}: {
  property: PropertyCardRow;
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
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/60 transition-shadow hover:shadow-soft">
      <div className="relative">
        <PropertyThumb
          propertyId={property.id}
          title={property.title}
          cover={cover}
          className="h-44 w-full rounded-none border-0"
        />
        {badge ? (
          <span
            className={cn(
              "absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              badge.tone,
            )}
          >
            {badge.label}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onToggleFavorite}
          title={favorite ? "Scoate din favorite" : "Adaugă la favorite"}
          aria-label={favorite ? "Scoate din favorite" : "Adaugă la favorite"}
          className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-card/90 text-muted-foreground backdrop-blur transition-colors hover:text-primary"
        >
          <Star className={cn("size-4", favorite && "fill-primary text-primary")} />
        </button>
        <span className="absolute bottom-3 left-3">
          <Checkbox
            checked={selected}
            onCheckedChange={(c) => onSelectedChange(c === true)}
            aria-label={`Selectează ${property.title}`}
            className="bg-card/90 backdrop-blur"
          />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {property.reference ? `${property.reference} · ` : ""}
            {propertyTypeLabels[property.property_type] ?? property.property_type}
          </p>
          <Link
            to="/app/properties/$id"
            params={{ id: property.id }}
            className="mt-0.5 line-clamp-2 font-medium hover:text-primary"
          >
            {property.title}
          </Link>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {[property.district, property.city].filter(Boolean).join(", ") ||
              "Locație nespecificată"}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={propertyStatusTone[property.status]} dot>
              {propertyStatusLabels[property.status]}
            </StatusBadge>
            <StatusBadge tone="primary">{transactionLabels[property.transaction_kind]}</StatusBadge>
          </div>
          <p className="text-xl font-medium tracking-tight">
            {formatMoney(property.price, property.currency)}
          </p>
        </div>

        {facts.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {facts.map((f) => (
              <span
                key={f.text}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground"
              >
                <f.icon className="size-3.5 shrink-0" aria-hidden /> {f.text}
              </span>
            ))}
          </div>
        ) : null}

        {(property.features ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {(property.features ?? []).slice(0, 3).map((f) => (
              <span
                key={f}
                className="rounded-full bg-secondary/60 px-2.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>
        ) : null}

        {activePortals.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {activePortals.map((c) => (
              <span
                key={c.portalId}
                title={c.portalName}
                className="relative inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <PortalLogo
                  portalId={c.portalId}
                  name={c.portalName}
                  size={14}
                  className="rounded-sm"
                />
                {c.portalName}
                {c.state === "error" ? (
                  <span
                    aria-label="Problemă pe acest portal"
                    className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive"
                  />
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
