import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GUIDE_IDS, implementedGuides } from "./onboarding-tour";

const guideInput = z.object({ guideId: z.enum(GUIDE_IDS) });

export const getGuideProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [settings, progress] = await Promise.all([
      context.supabase.from("onboarding_guide_settings").select("auto_start").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("onboarding_guide_progress").select("guide_id,status").eq("user_id", context.userId),
    ]);
    if (settings.error || progress.error) throw new Error("Progresul ghidurilor nu a putut fi încărcat.");
    return { autoStart: settings.data?.auto_start ?? true, progress: progress.data ?? [] };
  });

export const claimGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(guideInput)
  .handler(async ({ data, context }) => {
    const guide = implementedGuides.find((g) => g.id === data.guideId);
    const { data: roles, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (roleError || !guide || !(roles ?? []).some((r) => guide.roles.includes(r.role))) return false;
    const { data: claimed, error } = await context.supabase.rpc("claim_onboarding_guide", { p_guide_id: data.guideId });
    if (error) throw new Error("Pornirea ghidului nu a putut fi înregistrată.");
    return claimed === true;
  });

export const finishGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(guideInput.extend({ completed: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("finish_onboarding_guide", { p_guide_id: data.guideId, p_completed: data.completed });
    if (error) throw new Error("Progresul ghidului nu a putut fi salvat.");
    return { ok: true };
  });

export const setGuideAutoStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("onboarding_guide_settings").upsert({ user_id: context.userId, auto_start: data.enabled, updated_at: new Date().toISOString() });
    if (error) throw new Error("Setarea ghidurilor nu a putut fi salvată.");
    return { ok: true };
  });