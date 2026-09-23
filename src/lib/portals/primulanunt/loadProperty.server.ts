/**
 * Citirea datelor reale pentru mapper-ul PrimulAnunț.ro (server-only).
 *
 * Singurul rol: să transforme rândurile din DB în `PrimulAnuntMapperProperty` și
 * în partea de agent/organizație a `PrimulAnuntMapperContext`. Nicio regulă de
 * business — acelea rămân în `mapper.ts`.
 *
 * Coloanele sunt exact cele confirmate la `loadRomimoMapperInput`, plus cele noi
 * verificate în schemă: `features` (text[]), `bathrooms` (int), `postal_code`
 * (text), `building_floors` (int).
 */
import type { PrimulAnuntMapperContext, PrimulAnuntMapperProperty } from "./mapper";

export type PrimulAnuntMapperInput =
  | {
      ok: true;
      property: PrimulAnuntMapperProperty;
      context: Pick<PrimulAnuntMapperContext, "agent" | "organization" | "generateReference">;
    }
  | { ok: false; reasons: string[] };

type Row = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length > 0 ? items : null;
}

export async function loadPrimulAnuntMapperInput(
  propertyId: string,
  input: { organizationId: string },
): Promise<PrimulAnuntMapperInput> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!property) return { ok: false, reasons: ["Proprietatea nu a fost găsită."] };

  const row = property as Row;
  const assignedTo = str(row["assigned_to"]);

  const [{ data: org }, agentResult] = await Promise.all([
    supabaseAdmin
      .from("organizations")
      .select("phone, material_phone")
      .eq("id", input.organizationId)
      .maybeSingle(),
    assignedTo
      ? supabaseAdmin
          .from("profiles")
          .select("full_name, email, phone")
          .eq("id", assignedTo)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const agentRow = (agentResult.data ?? null) as Row | null;
  const orgRow = (org ?? null) as Row | null;

  const mapped: PrimulAnuntMapperProperty = {
    id: String(row["id"]),
    reference: str(row["reference"]),
    propertyType: str(row["property_type"]),
    transactionKind: str(row["transaction_kind"]),
    title: str(row["title"]),
    description: str(row["description"]),
    price: num(row["price"]),
    currency: str(row["currency"]),
    salePrice: num(row["sale_price"]),
    saleCurrency: str(row["sale_currency"]),
    rooms: num(row["rooms"]),
    bathrooms: num(row["bathrooms"]),
    usableSurface: num(row["usable_surface"]),
    county: str(row["county"]),
    city: str(row["city"]),
    district: str(row["district"]),
    features: strings(row["features"]),
    lat: num(row["lat"]),
    lng: num(row["lng"]),
    postalCode: str(row["postal_code"]),
    floor: num(row["floor"]),
    buildingFloors: num(row["building_floors"]),
    assignedTo,
  };

  return {
    ok: true,
    property: mapped,
    context: {
      agent: agentRow
        ? {
            fullName: str(agentRow["full_name"]),
            email: str(agentRow["email"]),
            phone: str(agentRow["phone"]),
          }
        : null,
      organization: orgRow
        ? {
            phone: str(orgRow["phone"]),
            materialPhone: str(orgRow["material_phone"]),
          }
        : null,
      generateReference: async () => {
        const { data, error } = await supabaseAdmin.rpc("next_property_reference");
        if (error || typeof data !== "string") {
          throw new Error("Nu am putut genera referința CRM.");
        }
        return data;
      },
    },
  };
}
