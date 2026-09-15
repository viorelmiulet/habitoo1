/**
 * Persistența `X-Source-Version` per (agenție, portal, external_id, mediu).
 *
 * Versiunea este text zecimal în DB și în header — nu trece niciodată prin
 * `Number`. Un retry refolosește rândul existent; doar o operație nouă cere
 * `reserveNextVersion`.
 */
import { LACHEIE_PORTAL_KEY, type LaCheieEnvironment } from "./config";
import { FIRST_SOURCE_VERSION, nextSourceVersion, normalizeSourceVersion } from "./version";

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export type VersionRecord = {
  sourceVersion: string;
  acceptedVersion: string | null;
  conflict: boolean;
};

export async function readVersionRecord(
  admin: AdminClient,
  input: {
    organizationId: string;
    propertyId: string;
    externalId: string;
    environment: LaCheieEnvironment;
  },
): Promise<VersionRecord | null> {
  const { data } = await admin
    .from("portal_listing_versions")
    .select("source_version, accepted_version, conflict")
    .eq("organization_id", input.organizationId)
    .eq("portal", LACHEIE_PORTAL_KEY)
    .eq("external_id", input.externalId)
    .eq("environment", input.environment)
    .maybeSingle();
  if (!data) return null;
  return {
    sourceVersion: normalizeSourceVersion(data.source_version) ?? "0",
    acceptedVersion: normalizeSourceVersion(data.accepted_version),
    conflict: data.conflict === true,
  };
}

/** Rezervă versiunea pentru o operație NOUĂ și o persistă înainte de request. */
export async function reserveNextVersion(
  admin: AdminClient,
  input: {
    organizationId: string;
    propertyId: string;
    externalId: string;
    environment: LaCheieEnvironment;
    operation: string;
  },
): Promise<string> {
  const current = await readVersionRecord(admin, input);
  const version = current
    ? nextSourceVersion({ current: current.sourceVersion, accepted: current.acceptedVersion })
    : FIRST_SOURCE_VERSION;
  await admin.from("portal_listing_versions").upsert(
    {
      organization_id: input.organizationId,
      portal: LACHEIE_PORTAL_KEY,
      property_id: input.propertyId,
      external_id: input.externalId,
      environment: input.environment,
      source_version: version,
      conflict: false,
      last_operation: input.operation,
      last_status: "pending",
      last_error: null,
    },
    { onConflict: "organization_id,portal,external_id,environment" },
  );
  return version;
}

export async function recordVersionOutcome(
  admin: AdminClient,
  input: {
    organizationId: string;
    externalId: string;
    environment: LaCheieEnvironment;
    status: string;
    error?: string | null;
    conflict?: boolean;
    acceptedVersion?: string | null;
  },
): Promise<void> {
  await admin
    .from("portal_listing_versions")
    .update({
      last_status: input.status,
      last_error: input.error ?? null,
      conflict: input.conflict === true,
      ...(input.acceptedVersion !== undefined ? { accepted_version: input.acceptedVersion } : {}),
    })
    .eq("organization_id", input.organizationId)
    .eq("portal", LACHEIE_PORTAL_KEY)
    .eq("external_id", input.externalId)
    .eq("environment", input.environment);
}
