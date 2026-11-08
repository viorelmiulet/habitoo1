import { checkRelayIp, relayConfigured } from "./relay.server";

export async function recordRelayResponse(ok: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("record_portal_relay_response", { _ok: ok });
  if (error) throw new Error("Starea releului nu a putut fi înregistrată.");
}

/** Existing bounded publication cron is the only recovery driver; no extra polling schedule. */
export async function recoverPortalRelay(admin: any) {
  if (!relayConfigured()) return;
  const { data, error } = await admin.rpc("claim_portal_relay_probe");
  if (error) throw new Error("Starea releului nu a putut fi citită.");
  if (data !== true) return;
  const result = await checkRelayIp();
  // Even a 403 proves connectivity; configuration errors are shown by the existing check card.
  await recordRelayResponse(result.ok || result.reason !== "unreachable");
}