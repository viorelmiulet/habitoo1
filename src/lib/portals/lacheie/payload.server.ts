/**
 * Construcția payload-urilor La Cheie pentru o ofertă (server-only).
 *
 * Aceleași reguli de eligibilitate ca feedul public: o ofertă arhivată,
 * ștearsă sau nepublicabilă nu ajunge niciodată la portal. Id-urile de
 * taxonomie vin exclusiv din catalogul sincronizat, nu din constante.
 */
import { CRM_URL } from "@/lib/host";
import { publicCoords } from "@/lib/geo";
import {
  feedImageUrl,
  isImageFeedEligible,
  isPropertyFeedEligible,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";
import {
  constructionStageFor,
  laCheieCategory,
  petFriendlyFor,
  resolveLaCheieIds,
  resolveOptionId,
  resolveOptionPk,
  resolveOptionPks,
  type LaCheieCatalog,
} from "./catalog";
import {
  buildLaCheieOffer,
  type LaCheieOffer,
  type LaCheieTransaction,
} from "./mapper";

export type LaCheiePayloadBuild =
  | { ok: true; offers: { transaction: LaCheieTransaction; offer: LaCheieOffer }[]; warnings: string[] }
  | { ok: false; reasons: string[] };

/** Tranzacțiile active: vânzare + închiriere produc două anunțuri distincte. */
export function laCheieTransactions(property: PropertyRow): LaCheieTransaction[] {
  const list: LaCheieTransaction[] = [];
  if (property.for_sale) list.push("sale");
  if (property.for_rent) list.push("rent");
  if (list.length === 0 && property.transaction_kind === "sale") list.push("sale");
  if (list.length === 0 && property.transaction_kind === "rent") list.push("rent");
  return list;
}

function priceFor(
  property: PropertyRow,
  transaction: LaCheieTransaction,
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

function textList(values: (string | null)[] | null | undefined): string[] {
  return (values ?? []).map((value) => (value ?? "").trim()).filter((value) => value.length > 0);
}

export async function buildLaCheiePayload(input: {
  organizationId: string;
  propertyId: string;
  catalog: LaCheieCatalog;
}): Promise<LaCheiePayloadBuild> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("*")
    .eq("id", input.propertyId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!property) return { ok: false, reasons: ["Proprietatea nu a fost găsită."] };

  const row = property as PropertyRow;
  if (!isPropertyFeedEligible(row)) {
    return {
      ok: false,
      reasons: [
        "Oferta nu este publicabilă (arhivată, ștearsă sau nepublicată): verifică statusul și publicarea pe site.",
      ],
    };
  }

  const [{ data: images }, { data: org }, agentResult] = await Promise.all([
    supabaseAdmin
      .from("property_images")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("property_id", input.propertyId)
      .order("position", { ascending: true }),
    supabaseAdmin.from("organizations").select("phone").eq("id", input.organizationId).maybeSingle(),
    row.assigned_to
      ? supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("id", row.assigned_to)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const resolution = resolveLaCheieIds({
    catalog: input.catalog,
    propertyType: row.property_type,
    county: row.county,
    city: row.city,
  });
  if (!resolution.ok) return { ok: false, reasons: resolution.reasons };

  const category = laCheieCategory(row.property_type);
  if (!category) {
    return { ok: false, reasons: ["Tipul de proprietate nu are corespondent La Cheie."] };
  }

  const transactions = laCheieTransactions(row);
  if (transactions.length === 0) {
    return { ok: false, reasons: ["Oferta nu are tranzacție activă (vânzare sau închiriere)."] };
  }

  const imageUrls = ((images ?? []) as PropertyImageRow[])
    .filter(isImageFeedEligible)
    .map((image) => feedImageUrl(CRM_URL, image.id));

  const coords = publicCoords(row);
  const agent = agentResult.data as {
    id?: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;

  const offers: { transaction: LaCheieTransaction; offer: LaCheieOffer }[] = [];
  const warnings: string[] = [];
  const reasons: string[] = [];

  for (const transaction of transactions) {
    const { price, currency } = priceFor(row, transaction);
    const result = buildLaCheieOffer(
      {
        id: row.id,
        title: row.title,
        description: row.description,
        price,
        currency,
        transaction,
        category,
        propertyTypeId: resolution.propertyTypeId,
        countyId: resolution.countyId,
        cityId: resolution.cityId,
        area: row.usable_surface ?? row.built_surface ?? row.surface ?? row.total_usable_surface,
        landArea: row.land_surface,
        bedrooms: row.bedrooms,
        bathrooms: row.bathrooms,
        yearBuilt: row.build_year,
        numberOfRooms: row.rooms,
        floor: row.floor,
        comfort: resolveOptionId(input.catalog, "comfort", row.comfort),
        partitioning: resolveOptionId(input.catalog, "partitioning", row.layout),
        constructionStage:
          resolveOptionId(input.catalog, "construction_stage", row.construction_stage) ??
          constructionStageFor(input.catalog, row.build_year),
        neighbourhood: row.district,
        streetName: row.street,
        streetNumber: row.street_number,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        petFriendly: petFriendlyFor(input.catalog, row.pet_friendly),
        strengths: textList(row.tags),
        facilities: resolveOptionPks(input.catalog, "facilities", textList(row.building_amenities)),
        utilities: resolveOptionPks(input.catalog, "utilities", textList(row.utilities)),
        nearby: resolveOptionPks(input.catalog, "nearby", textList(row.views)),
        heating: resolveOptionPk(
          input.catalog,
          "heating",
          row.heating ?? textList(row.heating_systems)[0] ?? null,
        ),
        cooling: resolveOptionPk(input.catalog, "cooling", textList(row.cooling_systems)[0] ?? null),
        parking: resolveOptionPk(input.catalog, "parking", row.parking),
        images: imageUrls,
      },
      {
        external_id: agent?.id ?? row.assigned_to ?? "",
        full_name: agent?.full_name ?? "",
        phone: agent?.phone ?? org?.phone ?? "",
        ...(agent?.email ? { email: agent.email } : {}),
      },
    );

    if (!result.ok) {
      for (const reason of result.reasons) {
        if (!reasons.includes(reason)) reasons.push(reason);
      }
      continue;
    }
    offers.push({ transaction, offer: result.offer });
    for (const warning of result.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
    if (result.removedFields.length) {
      warnings.push(`Câmpuri neacceptate eliminate: ${result.removedFields.join(", ")}.`);
    }
  }

  if (offers.length === 0) return { ok: false, reasons };
  if (reasons.length) warnings.push(...reasons);
  return { ok: true, offers, warnings };
}
