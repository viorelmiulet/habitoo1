import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

import { PropertyThumb, usePropertyCovers } from "@/components/app/PropertyThumb";
import { StatusBadge } from "@/components/app/StatusBadge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatMoney, formatNumber } from "@/lib/format";
import { propertyStatusLabels, propertyStatusTone } from "@/lib/labels";

export type AgentPortfolioProperty = {
  id: string;
  title: string;
  reference: string | null;
  status: string;
  price: number | null;
  currency: string | null;
  rooms: number | null;
  surface: number | null;
  city: string | null;
  district: string | null;
  transactionKind: string;
};

export type AgentPortfolioGroup = {
  id: string;
  name: string;
  isActive: boolean;
  properties: AgentPortfolioProperty[];
};

export function AgentPortfolioList({
  groups,
  emptyText = "Nu există proprietăți active în acest portofoliu.",
}: {
  groups: AgentPortfolioGroup[];
  emptyText?: string;
}) {
  const propertyIds = groups.flatMap((group) => group.properties.map((property) => property.id));
  const coverOf = usePropertyCovers(propertyIds);

  return (
    <Accordion type="multiple" className="divide-y divide-border">
      {groups.map((group) => (
        <AccordionItem key={group.id} value={group.id} className="border-0 px-4">
          <AccordionTrigger className="gap-3 py-3.5 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{group.name}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {group.properties.length} {group.properties.length === 1 ? "proprietate" : "proprietăți"}
                </span>
              </span>
              {!group.isActive ? <StatusBadge tone="neutral">Inactiv</StatusBadge> : null}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            {group.properties.length === 0 ? (
              <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
                {emptyText}
              </p>
            ) : (
              <ul className="space-y-2">
                {group.properties.map((property) => {
                  const status = property.status as keyof typeof propertyStatusLabels;
                  return (
                    <li
                      key={property.id}
                      className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-2.5"
                    >
                      <PropertyThumb
                        propertyId={property.id}
                        title={property.title}
                        cover={coverOf(property.id)}
                        className="size-16 rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/app/properties/$id"
                          params={{ id: property.id }}
                          className="block truncate text-sm font-semibold hover:text-primary"
                        >
                          {property.title}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[
                            property.reference,
                            property.district ?? property.city,
                            property.rooms ? `${property.rooms} cam.` : null,
                            property.surface ? `${formatNumber(property.surface)} m²` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <StatusBadge tone={propertyStatusTone[status] ?? "neutral"} dot>
                            {propertyStatusLabels[status] ?? property.status}
                          </StatusBadge>
                          <span className="text-xs text-muted-foreground">
                            {property.transactionKind === "rent" ? "Închiriere" : "Vânzare"}
                          </span>
                        </div>
                      </div>
                      <p className="shrink-0 text-sm font-semibold">
                        {formatMoney(property.price, property.currency)}
                        {property.transactionKind === "rent" ? "/lună" : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}