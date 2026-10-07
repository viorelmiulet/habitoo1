/**
 * Webhook VDI.ro „lead_nou” (secțiunea „Preluare leaduri”).
 *   - agenția se alege după `agentie_id` (= `external_account_id` al conexiunii VDI);
 *   - `X-VDI-Semnatura` = `sha256=` + HMAC-SHA256 hex pe corpul brut, cu secretul
 *     acelei agenții, comparat în timp constant; greșită/lipsă → 401;
 *   - 2xx doar după salvarea în `portal_webhook_events`; dedupe după `lead.id`;
 *   - procesare în cerere ≤1500 ms, restul prin cron-ul VDI (`vdi_leads_arm`).
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export const Route = createFileRoute("/api/public/portal/v1/vdi/leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { clientIp, collectHeaders } = await import("@/lib/portals/storia/notifications.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: allowed } = await supabaseAdmin.rpc("rate_limit_hit", {
          _bucket: `vdi-webhook:${clientIp(request)}`,
          _limit: 120,
          _window_seconds: 60,
        });
        if (allowed === false) return json({ status: "rate_limited" }, 429);

        const rawBody = await request.text().catch(() => "");
        if (rawBody.length > 200_000) return json({ status: "too_large" }, 413);
        const { readVdiAgencyId, verifyVdiSignature, parseVdiWebhook } = await import("@/lib/portals/vdi/leads");
        const agencyId = readVdiAgencyId(rawBody);
        if (!agencyId) return json({ status: "invalid_signature" }, 401);

        const { data: conn } = await supabaseAdmin
          .from("portal_connections")
          .select("organization_id, settings")
          .eq("portal", "vdi")
          .eq("external_account_id", agencyId)
          .maybeSingle();
        const encrypted = (conn?.settings as Record<string, unknown> | null)?.["webhook_secret_encrypted"];
        let secret: string | null = null;
        if (typeof encrypted === "string") {
          const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
          try {
            secret = decryptPortalCredential(encrypted);
          } catch {
            secret = null;
          }
        }
        if (!conn || !verifyVdiSignature(rawBody, request.headers.get("x-vdi-semnatura"), secret)) {
          await supabaseAdmin.from("portal_webhook_events").insert({
            portal: "vdi",
            organization_id: conn?.organization_id ?? null,
            http_method: "POST",
            signature_present: Boolean(request.headers.get("x-vdi-semnatura")),
            signature_valid: false,
            signature_note: conn ? "semnătură invalidă" : "agenție necunoscută",
            headers: collectHeaders(request) as never,
            process_note: "respins",
          } as never);
          return json({ status: "invalid_signature" }, 401);
        }

        const parsed = parseVdiWebhook(rawBody);
        const leadId = parsed.lead?.id ?? request.headers.get("idempotency-key")?.trim().slice(0, 120) ?? null;
        if (parsed.event !== "lead_nou" || !parsed.lead || !leadId) return json({ status: "ignored" }, 200);

        const { recordVdiLeadEvent, processVdiLeadEvent } = await import("@/lib/portals/vdi/leads.server");
        let recorded;
        try {
          recorded = await recordVdiLeadEvent(supabaseAdmin, {
            organizationId: conn.organization_id,
            rawLead: (parsed.raw as Record<string, unknown>)["lead"],
            leadId,
            source: "webhook",
            headers: collectHeaders(request),
            rawBody,
          });
        } catch {
          return json({ status: "retry" }, 503);
        }
        if (!recorded.eventId) return json({ status: "retry" }, 503);
        if (recorded.duplicate && recorded.processed) return json({ status: "ok", duplicate: true }, 200);

        const { processWithinBudget, STORIA_INLINE_BUDGET_MS } = await import("@/lib/portals/storia/webhook-retry.server");
        const eventId = recorded.eventId;
        const outcome = await processWithinBudget(async () => {
          const r = await processVdiLeadEvent({
            eventId,
            parsed: { organization_id: conn.organization_id, lead: (parsed.raw as Record<string, unknown>)["lead"] },
            attempts: 0,
          });
          if (!r.processed) throw new Error("neprocesat");
        }, STORIA_INLINE_BUDGET_MS);
        if (outcome !== "done") {
          await supabaseAdmin.rpc("vdi_leads_arm").then(() => undefined, () => undefined);
        }
        return json({ status: "ok", processed: outcome === "done" }, 200);
      },
    },
  },
});
