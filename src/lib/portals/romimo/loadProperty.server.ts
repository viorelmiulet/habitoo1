/**
 * Citirea datelor reale pentru mapper-ul Romimo (server-only).
 *
 * Singurul rol: să transforme rândurile din DB în `RomimoMapperProperty` și în
 * partea de agent/organizație a `RomimoMapperContext`. Nu aplică nicio regulă
 * de business — regulile rămân în `mapper.ts`.
 */
import { CRM_URL } from "@/lib/host";
import type { RomimoMapperContext, RomimoMapperProperty } from "./mapper";

export type RomimoMapperInput =
  | {
      ok: true;
      property: RomimoMapperProperty;
      context: Pick<
        RomimoMapperContext,
        "agent" | "organization" | "generateReference" | "publicBaseUrl"
      >;
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

export async function loadRomimoMapperInput(
  propertyId: string,
  input: { organizationId: string },
): Promise<RomimoMapperInput> {
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

  const [{ data: images }, { data: org }, agentResult] = await Promise.all([
    supabaseAdmin
      .from("property_images")
      .select("id, include_in_publish, is_confidential, position, created_at")
      .eq("organization_id", input.organizationId)
      .eq("property_id", propertyId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
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

  const imageRows = ((images ?? []) as Row[]).map((image) => ({
    id: String(image["id"]),
    includeInPublish: image["include_in_publish"] !== false,
    isConfidential: image["is_confidential"] === true,
    rank: num(image["position"]),
  }));

  const agentRow = (agentResult.data ?? null) as Row | null;
  const orgRow = (org ?? null) as Row | null;

  const mapped: RomimoMapperProperty = {
    id: String(row["id"]),
    reference: str(row["reference"]),
    propertyType: str(row["property_type"]),
    transactionKind: str(row["transaction_kind"]),
    rooms: num(row["rooms"]),
    title: str(row["title"]),
    description: str(row["description"]),
    price: num(row["price"]),
    currency: str(row["currency"]),
    salePrice: num(row["sale_price"]),
    saleCurrency: str(row["sale_currency"]),
    county: str(row["county"]),
    city: str(row["city"]),
    district: str(row["district"]),
    lat: num(row["lat"]),
    lng: num(row["lng"]),
    assignedTo,
    usableSurface: num(row["usable_surface"]),
    builtSurface: num(row["built_surface"]),
    landSurface: num(row["land_surface"]),
    surface: num(row["surface"]),
    // `floor_label` există în schemă, dar nu este citit intenționat:
    // mapper-ul calculează etajul exclusiv din `floor`.
    floor: num(row["floor"]),
    layout: str(row["layout"]),
    buildYear: num(row["build_year"]),
    heatingSystems: strings(row["heating_systems"]),
    images: imageRows,
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
      publicBaseUrl: CRM_URL,
    },
  };
}
