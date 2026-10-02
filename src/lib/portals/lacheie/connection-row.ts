/**
 * Rândul `portal_connections` pentru La Cheie (cheia e a CRM-ului, nu a agenției).
 * Separat ca să poată fi testat cu un client fals.
 */
import { LACHEIE_ENVIRONMENT, LACHEIE_PORTAL_KEY } from "./config";

/** Valorile permise de constrângerea `portal_connections_status_check`. */
export const PORTAL_CONNECTION_STATUSES = [
  "not_configured",
  "ready",
  "connected",
  "error",
  "disconnected",
] as const;

export const LACHEIE_CONNECTION_CREATE_ERROR = "Conexiunea La Cheie nu a putut fi creată.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function readRow(admin: Admin, organizationId: string) {
  const { data } = await admin
    .from("portal_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portal", LACHEIE_PORTAL_KEY)
    .maybeSingle();
  return data ?? null;
}

export async function ensureLaCheieConnectionRow(
  admin: Admin,
  organizationId: string,
  actorId: string | null,
) {
  const existing = await readRow(admin, organizationId);
  if (existing) return existing;
  const { data, error } = await admin
    .from("portal_connections")
    .insert({
      organization_id: organizationId,
      portal: LACHEIE_PORTAL_KEY,
      direction: "habitoo_to_portal",
      authentication_mode: "portal_api_key",
      status: "not_configured",
      settings: {},
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .maybeSingle();
  if (!error && data) return data;
  // Creat între timp de altă cerere: refolosim rândul existent.
  if (error?.code === "23505") {
    const row = await readRow(admin, organizationId);
    if (row) return row;
  }
  await admin.from("portal_operation_logs").insert({
    organization_id: organizationId,
    portal: LACHEIE_PORTAL_KEY,
    operation: "connection_create",
    success: false,
    error_code: error?.code ?? "no_row",
    error_message: "Crearea conexiunii a eșuat.",
    actor_id: actorId,
    environment: LACHEIE_ENVIRONMENT,
  });
  throw new Error(LACHEIE_CONNECTION_CREATE_ERROR);
}
