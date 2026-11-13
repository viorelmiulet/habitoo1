/**
 * SuperAdmin → AI → „Modele AI”: modelele de text (rapid, standard, rezervă).
 * Doar superadminul citește, salvează și testează. Cheile nu se returnează niciodată.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_MODEL_DEFAULTS, AI_MODEL_NAME_PATTERN, type AiModelSlot } from "./providers/models";
import { AI_MEDIA_MODEL_DEFAULTS, AI_MEDIA_MODEL_NAME_PATTERN, type AiMediaModelSlot } from "./media/models";

export type AiModelSettingsView = {
  saved: Record<AiModelSlot | AiMediaModelSlot, string>;
  defaults: Record<AiModelSlot | AiMediaModelSlot, string>;
  falConfigured: boolean;
  geminiConfigured: boolean;
  mistralConfigured: boolean;
};

async function assertSuperadmin(context: { supabase: unknown; userId: string }) {
  const supabase = context.supabase as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
  };
  const { data } = await supabase.rpc("has_role", { _user_id: context.userId, _role: "superadmin" });
  if (data !== true) throw new Error("Doar administratorul platformei poate schimba modelele AI.");
}

export const getAiModelSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiModelSettingsView> => {
    await assertSuperadmin(context);
    const { data } = await context.supabase
      .from("ai_model_settings")
      .select("fast_model,standard_model,fallback_model,image_model,video_model,voice_model")
      .eq("id", true)
      .maybeSingle();
    return {
      saved: {
        fast: data?.fast_model ?? "",
        standard: data?.standard_model ?? "",
        fallback: data?.fallback_model ?? "",
        image: data?.image_model ?? "",
        video: data?.video_model ?? "",
        voice: data?.voice_model ?? "",
      },
      defaults: { ...AI_MODEL_DEFAULTS, ...AI_MEDIA_MODEL_DEFAULTS },
      falConfigured: Boolean(process.env["FAL_KEY"]?.trim()),
      geminiConfigured: Boolean(process.env["GEMINI_API_KEY"]?.trim()),
      mistralConfigured: Boolean(process.env["MISTRAL_API_KEY"]?.trim()),
    };
  });

const modelField = z
  .string()
  .trim()
  .max(100)
  .refine((v) => v === "" || AI_MODEL_NAME_PATTERN.test(v), "Numele modelului nu este valid.");

const mediaField = z
  .string()
  .trim()
  .max(150)
  .refine((v) => v === "" || (AI_MEDIA_MODEL_NAME_PATTERN.test(v) && !v.includes("..")), "Numele modelului nu este valid.");

const saveSchema = z.object({ fast: modelField, standard: modelField, fallback: modelField, image: mediaField, video: mediaField, voice: mediaField });

export const saveAiModelSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertSuperadmin(context);
    const values = {
      fast_model: data.fast || null,
      standard_model: data.standard || null,
      fallback_model: data.fallback || null,
      image_model: data.image || null,
      video_model: data.video || null,
      voice_model: data.voice || null,
    };
    const { error } = await context.supabase
      .from("ai_model_settings")
      .upsert({ id: true, ...values, updated_by: context.userId, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error("Modelele AI nu au putut fi salvate.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "platform.ai_models_changed",
      entity: "ai_model_settings",
      new_values: values,
    } as never);
    const { invalidateAiModelSettingsCache } = await import("./providers/registry.server");
    invalidateAiModelSettingsCache();
    const { invalidateAiMediaModelSettingsCache } = await import("./media/model-settings.server");
    invalidateAiMediaModelSettingsCache();
    return { ok: true };
  });

const testSchema = z.union([
  z.object({ slot: z.enum(["fast", "standard", "fallback"]), model: modelField }),
  z.object({ slot: z.enum(["image", "video", "voice"]), model: mediaField }),
]);

export const testAiModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => testSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperadmin(context);
    if (data.slot === "image" || data.slot === "video" || data.slot === "voice") {
      const { runAiMediaModelTest } = await import("./media/model-test.server");
      return runAiMediaModelTest(data.slot, data.model);
    }
    const { runAiModelTest } = await import("./providers/model-test.server");
    return runAiModelTest(data.slot, data.model);
  });
