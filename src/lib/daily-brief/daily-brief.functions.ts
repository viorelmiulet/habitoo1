import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { briefDate, type DailyBriefData } from "./brief";

export const getDailyBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ refresh: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ data: DailyBriefData; sentence: string | null }> => {
    const db = context.supabase;
    const { data: org, error: orgError } = await db.rpc("current_org");
    if (orgError || !org) throw new Error("Agenția nu este disponibilă.");
    const date = briefDate(new Date());
    const base = () => db.from("daily_briefs").select("id,data,ai_sentence,ai_attempted").eq("user_id", context.userId).eq("organization_id", org).eq("brief_date", date);
    const cached = await base().maybeSingle();
    if (cached.error) throw new Error("Rezumatul nu este disponibil.");
    if (cached.data && !data.refresh) return { data: cached.data.data as unknown as DailyBriefData, sentence: cached.data.ai_sentence };
    const { loadDailyBrief } = await import("./data.server");
    const computed = await loadDailyBrief(db, org, context.userId);
    // Unique daily insert is the single-flight claim: only its winner may call AI.
    const claim = await db.from("daily_briefs").upsert({ user_id: context.userId, organization_id: org, brief_date: date, data: computed as unknown as Json, ai_attempted: true }, { onConflict: "user_id,brief_date", ignoreDuplicates: true }).select("id");
    if (claim.error) throw new Error("Rezumatul nu a putut fi salvat.");
    const claimedId = claim.data?.[0]?.id;
    let sentence: string | null = cached.data?.ai_sentence ?? null;
    if (claimedId && !data.refresh) {
      const { generateDailySentence } = await import("./sentence.server");
      sentence = await generateDailySentence(org, context.userId, computed.counts);
      const saved = await db.from("daily_briefs").update({ ai_sentence: sentence }).eq("id", claimedId);
      if (saved.error) throw new Error("Fraza zilnică nu a putut fi salvată.");
    } else if (!claimedId) {
      const saved = await db.from("daily_briefs").update({ data: computed as unknown as Json, updated_at: new Date().toISOString() }).eq("user_id", context.userId).eq("organization_id", org).eq("brief_date", date);
      if (saved.error) throw new Error("Rezumatul nu a putut fi actualizat.");
      const latest = await base().maybeSingle();
      sentence = latest.data?.ai_sentence ?? null;
    }
    return { data: computed, sentence };
  });