/**
 * Progress journal for Imobiliare.ro publication: one `step:<name>` row per stage in
 * portal_operation_logs, without personal data, so a frozen run shows where it stopped.
 */
import { withImobiliareTimeout } from "./wait";

export type ImobiliareStep = "session" | "photos" | "payload" | "create" | "update" | "gallery" | "promotion_online" | "photo_resize" | "photo_compress";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logImobiliareStep(db: any, input: { organizationId: string; propertyId: string; actorId?: string | null; step: ImobiliareStep; reference?: string | null; photo?: number }): Promise<void> {
  try {
    await withImobiliareTimeout(db.from("portal_operation_logs").insert({
      organization_id: input.organizationId, property_id: input.propertyId, portal: "imobiliare_ro",
      actor_id: input.actorId ?? null, operation: `step:${input.step}`, success: true,
      external_id: input.reference ?? null, error_message: null,
      portal_response: input.photo ? { photo: input.photo } : null,
    }), 5_000, "step log timeout");
  } catch {
    // Diagnostics never block or fail publication.
  }
}
