import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type PropertyRow = Tables<"properties">;

/** Câmpuri care descriu starea tehnică/publică a sursei și nu aparțin copiei. */
export const PROPERTY_DUPLICATE_EXCLUDED_FIELDS = [
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "reference",
  "status",
  "publish_status",
  "published_at",
  "external_id",
  "deleted_at",
  "last_activity_at",
] as const satisfies readonly (keyof PropertyRow)[];

/** Construiește exclusiv datele descriptive ale proprietății duplicate. */
export function buildDuplicatedProperty(
  source: PropertyRow,
  input: { organizationId: string; actorId: string; reference: string | null },
): TablesInsert<"properties"> {
  const copy = { ...source } as Record<string, unknown>;
  for (const key of PROPERTY_DUPLICATE_EXCLUDED_FIELDS) delete copy[key];

  return {
    ...(copy as TablesInsert<"properties">),
    organization_id: input.organizationId,
    created_by: input.actorId,
    updated_by: input.actorId,
    // Titlul rămâne identic cu sursa; copia se distinge prin referința nouă.
    title: source.title,
    reference: input.reference,
    status: "draft",
    publish_status: "draft",
    published_at: null,
    external_id: null,
    deleted_at: null,
    last_activity_at: null,
  };
}

export function duplicateStoragePath(
  organizationId: string,
  destinationPropertyId: string,
  sourcePath: string,
  fallbackName: string,
) {
  const rawName = sourcePath.split("/").pop() || fallbackName;
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${organizationId}/${destinationPropertyId}/${crypto.randomUUID()}-${safeName}`;
}