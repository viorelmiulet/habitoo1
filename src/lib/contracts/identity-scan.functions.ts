/**
 * C4 — „Scanează actul” pe fișa clientului. Funcționează pentru toate agențiile,
 * indiferent de setarea AI a agenției. Nimic din act nu se salvează aici; imaginile
 * rămân doar în memoria cererii și nu sunt logate.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SCAN_DOC_TYPES } from "@/lib/contracts/id/scan";
import type { ScanOutcome } from "@/lib/contracts/id/scan.server";

const image = z.object({ contentType: z.string().trim().max(100), base64: z.string().min(1).max(14_500_000) });
const input = z.object({
  contactId: z.string().uuid(),
  images: z.array(image).max(2),
  certificate: image.nullable().optional(),
  docType: z.enum(SCAN_DOC_TYPES).nullable().optional(),
});

export const scanContactIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }): Promise<ScanOutcome | { state: "not_configured"; message: string }> => {
    const { assertContactIdentityAccess } = await import("./contact-identity.server");
    await assertContactIdentityAccess(context.supabase, data.contactId);
    const { data: contact } = await context.supabase.from("contacts").select("organization_id").eq("id", data.contactId).maybeSingle();
    const org = contact?.organization_id ?? null;

    const { resolveAiProvider } = await import("@/lib/ai/providers/registry.server");
    const primary = resolveAiProvider();
    if (!primary) return { state: "not_configured", message: "Citirea automată nu este disponibilă. Completează manual." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runIdentityScan, ID_SCAN_PER_HOUR } = await import("@/lib/contracts/id/scan.server");
    const { prepareIdUpload } = await import("@/lib/contracts/id/prepare.server");
    const { writeAiUsage } = await import("@/lib/ai/usage/tracking.server");
    const { withAiProviderFallback } = await import("@/lib/ai/providers/fallback.server");

    let allowed = false;
    try {
      const { data: ok, error } = await supabaseAdmin.rpc("rate_limit_hit" as never, {
        _bucket: `contact_identity_scan:user:hour:${context.userId}`,
        _limit: ID_SCAN_PER_HOUR,
        _window_seconds: 3600,
      } as never);
      allowed = !error && ok === true;
    } catch {
      allowed = false;
    }

    const started = Date.now();
    try {
      const { result } = await withAiProviderFallback(primary, (provider) =>
        runIdentityScan(
          {
            provider,
            rateLimit: async () => allowed,
            prepare: async (img) => {
              const prepared = await prepareIdUpload(img);
              return prepared.ok ? { mimeType: prepared.attachment.mimeType, base64: prepared.attachment.base64 } : null;
            },
            audit: async (action) => {
              if (!org) return;
              await supabaseAdmin.from("audit_logs").insert({
                organization_id: org, actor_id: context.userId, action, entity: "contact", entity_id: data.contactId,
              } as never);
            },
            usage: async (u) => {
              if (!org) return;
              await writeAiUsage(supabaseAdmin as never, {
                organization_id: org, user_id: context.userId, provider: provider.id, model: provider.model,
                fallback_used: provider.id === "gemini", capability: "id_document_vision",
                input_tokens: u.inputTokens, output_tokens: u.outputTokens,
                latency_ms: Date.now() - started, success: u.success, tool_calls: u.calls,
              });
            },
          },
          data,
        ),
      );
      return result;
    } catch (error) {
      /* Doar tipul erorii — niciodată conținutul cererii sau al imaginii. */
      console.error("contact identity scan failed", error instanceof Error ? error.name : "unknown");
      return { state: "invalid", message: "Actul nu a putut fi citit acum. Încearcă din nou sau completează manual." };
    }
  });
