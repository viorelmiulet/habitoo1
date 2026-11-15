import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { Json } from "@/integrations/supabase/types";
import { briefDate, type DailyBriefData } from "./brief";

export const getDailyBrief = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ refresh: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ data: DailyBriefData; sentence: string | null }> => {
    const db = context.supabase;
    const { data: org, error: orgError } = await db.rpc("current_org");
    if (orgError || !org) throw new Error("Agenția nu este disponibilă.");
    const date = briefDate(new Date());
    const base = () => db.from("daily_briefs").select("id,data,ai_sentence,ai_attempted").eq("user_id", context.userId).eq("organization_id", org).eq("brief_date", date);
    const cached = await base().maybeSingle();
    if (cached.error) throw new Error("Rezumatul nu este disponibil.");
    if (cached.data?.ai_attempted && !data.refresh) return { data: cached.data.data as unknown as DailyBriefData, sentence: cached.data.ai_sentence };
    const { loadDailyBrief } = await import("./data.server");
    const computed = await loadDailyBrief(db, org, context.userId);
    const inserted = await db.from("daily_briefs").upsert({ user_id: context.userId, organization_id: org, brief_date: date, data: computed as unknown as Json, ai_attempted: false }, { onConflict: "user_id,brief_date", ignoreDuplicates: true });
    if (inserted.error) throw new Error("Rezumatul nu a putut fi salvat.");
    const savedData = await db.from("daily_briefs").update({ data: computed as unknown as Json, updated_at: new Date().toISOString() }).eq("user_id", context.userId).eq("organization_id", org).eq("brief_date", date);
    if (savedData.error) throw new Error("Rezumatul nu a putut fi actualizat.");
    // Compare-and-set claims exactly one attempt, including legacy unattempted rows.
    // Refresh never claims or modifies ai_attempted/ai_sentence.
    const claim = data.refresh ? null : await db.from("daily_briefs").update({ ai_attempted: true }).eq("user_id", context.userId).eq("organization_id", org).eq("brief_date", date).eq("ai_attempted", false).select("id");
    if (claim?.error) throw new Error("Rezumatul nu este disponibil.");
    const claimedId = claim?.data?.[0]?.id;
    if (claimedId) {
      const { generateDailySentence } = await import("./sentence.server");
      const sentence = await generateDailySentence(org, context.userId, computed.counts);
      const saved = await db.from("daily_briefs").update({ ai_sentence: sentence }).eq("id", claimedId);
      if (saved.error) throw new Error("Fraza zilnică nu a putut fi salvată.");
    }
    const latest = await base().maybeSingle();
    if (latest.error) throw new Error("Rezumatul nu este disponibil.");
    return { data: computed, sentence: latest.data?.ai_sentence ?? null };
  });