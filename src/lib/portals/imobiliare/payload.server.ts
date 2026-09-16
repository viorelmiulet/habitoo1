/**
 * Asamblarea anunțurilor Imobiliare.ro pentru o ofertă (server-only).
 *
 * Aceleași reguli de eligibilitate ca feedul public: o ofertă arhivată,
 * ștearsă sau nepublicabilă nu ajunge la portal. Locația vine din nomenclatorul
 * importat, categoria din catalogul citit de la portal, agentul din
 * sincronizarea de agenți — nimic nu e inventat local.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { publicCoords } from "@/lib/geo";
import { isPropertyFeedEligible, type PropertyRow } from "@/lib/site-feed/mapper";
import { imobiliareCustomReference } from "./config";
import { categoryApiFor, type CategoryCatalog } from "./categories.server";
import { resolveImobiliareLocation } from "./locations.server";
import { ensureImobiliareAgent } from "./agents.server";
import type { ImobiliareSession } from "./auth.server";
import { buildImobiliareListing, type ImobiliareListing } from "./mapper";

type Admin = SupabaseClient<Database>;

export type ImobiliareTransaction = "sale" | "rent";

export type ImobiliareListingPlan = {
  transaction: ImobiliareTransaction;
  customReference: string;
  listing: ImobiliareListing;
};

export type ImobiliarePayloadBuild =
  | { ok: true; plans: ImobiliareListingPlan[]; warnings: string[] }
  | { ok: false; reasons: string[]; warnings: string[] };

export function imobiliareTransactions(property: PropertyRow): ImobiliareTransaction[] {
  const list: ImobiliareTransaction[] = [];
  if (property.for_sale) list.push("sale");
  if (property.for_rent) list.push("rent");
  if (list.length === 0 && property.transaction_kind === "sale") list.push("sale");
  if (list.length === 0 && property.transaction_kind === "rent") list.push("rent");
  return list;
}

function priceFor(
  property: PropertyRow,
  transaction: ImobiliareTransaction,
): { price: number | null; currency: string } {
  const raw =
    transaction === "sale"
      ? (property.sale_price ?? property.price)
      : (property.rent_price ?? property.price);
  const currency = (
    (transaction === "sale" ? property.sale_currency : property.rent_currency) ??
    property.currency ??
    "EUR"
  ).toUpperCase();
  const price = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
  return { price, currency };
}

/** Referință distinctă pe tranzacție, în formatul strict cerut de portal. */
export function imobiliareReference(
  property: PropertyRow,
  transaction: ImobiliareTransaction,
  multiple: boolean,
): string {
  const base = imobiliareCustomReference(property.reference, property.id);
  if (!multiple) return base;
  return `${base}-${transaction === "sale" ? "V" : "C"}`.slice(0, 64);
}

export async function buildImobiliarePayload(input: {
  admin: Admin;
  session: ImobiliareSession;
  organizationId: string;
  propertyId: string;
  catalog: CategoryCatalog;
  imageCount: number;
}): Promise<ImobiliarePayloadBuild> {
  const warnings: string[] = [];

  const { data: property } = await input.admin
    .from("properties")
    .select("*")
    .eq("id", input.propertyId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!property) return { ok: false, reasons: ["Proprietatea nu a fost găsită."], warnings };

  const row = property as PropertyRow;
  if (!isPropertyFeedEligible(row)) {
    return {
      ok: false,
      warnings,
      reasons: [
        "Oferta nu este publicabilă (arhivată, ștearsă sau nepublicată): verifică statusul și publicarea pe site.",
      ],
    };
  }

  const transactions = imobiliareTransactions(row);
  if (transactions.length === 0) {
    return {
      ok: false,
      warnings,
      reasons: ["Oferta nu are tranzacție activă (vânzare sau închiriere)."],
    };
  }

  const location = await resolveImobiliareLocation(input.admin, {
    county: row.county,
    city: row.city,
    district: row.district,
  });
  if (!location.ok) return { ok: false, reasons: [location.reason], warnings };
  warnings.push(location.note);

  const agentIds: number[] = [];
  if (row.assigned_to) {
    const { data: profile } = await input.admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("id", row.assigned_to)
      .maybeSingle();
    if (profile) {
      const sync = await ensureImobiliareAgent({
        admin: input.admin,
        session: input.session,
        organizationId: input.organizationId,
        profile,
      });
      if (!sync.ok) return { ok: false, reasons: [sync.message], warnings };
      agentIds.push(sync.agentId);
      if (sync.created) warnings.push("Agentul a fost creat acum în contul Imobiliare.ro.");
    }
  }
  if (agentIds.length === 0) {
    return {
      ok: false,
      warnings,
      reasons: ["Oferta nu are un agent asignat cu email, necesar pentru Imobiliare.ro."],
    };
  }

  const coords = publicCoords(row);
  const plans: ImobiliareListingPlan[] = [];
  const reasons: string[] = [];

  for (const transaction of transactions) {
    const { price, currency } = priceFor(row, transaction);
    const customReference = imobiliareReference(row, transaction, transactions.length > 1);
    const categoryApi = categoryApiFor(input.catalog, row.property_type, transaction);
    const built = buildImobiliareListing({
      customReference,
      agentIds,
      categoryApi,
      locationId: location.locationId,
      title: row.title,
      description: row.description,
      price,
      currency,
      address: [row.street, row.street_number].filter(Boolean).join(" ") || row.address,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      imageCount: input.imageCount,

      propertyType: row.property_type,
      layout: row.layout,
      comfort: row.comfort,
      buildingType: row.building_type,
      buildingStructure: row.building_structure,
      constructionStage: row.construction_stage,
      buildYear: row.build_year,
      rooms: row.rooms,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      floor: row.floor,
      buildingFloors: row.building_floors,
      usableSurface: row.usable_surface ?? row.surface,
      builtSurface: row.built_surface,
      totalUsableSurface: row.total_usable_surface,
      balconies: row.balconies,
      terraces: row.terraces,
      kitchens: row.kitchens,
      garages: row.garages,
      parkingSpaces: row.parking_spaces,
      hasBasement: row.has_basement,
      hasSemiBasement: row.has_semi_basement,
      hasGroundFloor: row.has_ground_floor,
      hasAttic: row.has_attic,
      petFriendly: row.pet_friendly,
      exclusive: null,
      collaboration: row.collaboration,
      collaborationCommissionPercent: row.collab_commission_percent,
      commission: row.commission,

      features: row.features,
      utilities: row.utilities,
      buildingAmenities: row.building_amenities,
      heatingSystems: row.heating_systems,
      coolingSystems: row.cooling_systems,
      heating: row.heating,
      finishState: row.finish_state,
      insulation: row.insulation,
      wallFinishes: row.wall_finishes,
      floorFinishes: row.floor_finishes,
      windows: row.windows,
      blinds: row.blinds,
      shutters: row.shutters,
      entryDoor: row.entry_door,
      interiorDoors: row.interior_doors,
      additionalSpaces: row.additional_spaces,
      kitchenFeatures: row.kitchen_features,
      metering: row.metering,
      appliances: row.appliances,
      streetArrangement: row.street_arrangement,
      furnishing: row.furnishing,
    });

    if (!built.ok) {
      for (const reason of built.reasons) if (!reasons.includes(reason)) reasons.push(reason);
      continue;
    }
    plans.push({ transaction, customReference, listing: built.listing });
    for (const warning of built.warnings) if (!warnings.includes(warning)) warnings.push(warning);
  }

  if (plans.length === 0) return { ok: false, reasons, warnings };
  if (reasons.length) warnings.push(...reasons);
  return { ok: true, plans, warnings };
}
