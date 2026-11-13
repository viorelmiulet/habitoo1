/**
 * Creditele AI lunare ale agenției (browser-safe).
 *
 * Bugetul = creditele planului (`ai_credit_plans`) + creditele bonus ale agenției.
 * Rezervarea și restituirea se fac atomic în baza de date (`ai_credit_reserve`);
 * aici sunt doar constantele implicite și formatarea mesajelor.
 */
import type { AiModelClass } from "@/lib/ai/providers/models";

export const AI_CREDIT_ACTIONS = [
  "text_fast",
  "text_standard",
  "marketing_image",
  "photo_enhance",
  "photo_video",
  "ai_video_voice",
  "listing_autofill",
  "lead_message_analysis",
  "match_message",
] as const;
export type AiCreditAction = (typeof AI_CREDIT_ACTIONS)[number];

export const AI_CREDIT_ACTION_LABELS: Record<AiCreditAction, string> = {
  text_fast: "Text AI (model rapid)",
  text_standard: "Text AI (model standard)",
  marketing_image: "Imagine de marketing",
  photo_enhance: "Îmbunătățire poză",
  photo_video: "Video din poză",
  ai_video_voice: "Voce în video",
  listing_autofill: "Anunț din poze și voce",
  lead_message_analysis: "Analiză mesaj lead",
  match_message: "Mesaj potrivire",
};

export const DEFAULT_AI_CREDIT_COSTS: Record<AiCreditAction, number> = {
  text_fast: 1,
  text_standard: 2,
  marketing_image: 10,
  photo_enhance: 10,
  photo_video: 40,
  ai_video_voice: 5,
  listing_autofill: 5,
  lead_message_analysis: 1,
  match_message: 1,
};

export const AI_CREDIT_PLANS = ["basic", "pro", "unlimited"] as const;
export type AiCreditPlan = (typeof AI_CREDIT_PLANS)[number];
export const AI_CREDIT_PLAN_LABELS: Record<AiCreditPlan, string> = { basic: "Basic", pro: "Pro", unlimited: "Unlimited" };
export const DEFAULT_AI_PLAN_CREDITS: Record<AiCreditPlan, number> = { basic: 300, pro: 1500, unlimited: 6000 };

export const AI_CREDITS_WARNING_RATIO = 0.8;

export type AiCreditUsage = {
  used: number;
  limit: number;
  plan: string;
  bonus: number;
  monthStart: string;
  resetOn: string;
  byAction: Partial<Record<AiCreditAction, number>>;
};

export function textCreditAction(modelClass: AiModelClass): AiCreditAction {
  return modelClass === "fast" ? "text_fast" : "text_standard";
}

/** „1 decembrie” pentru o dată `YYYY-MM-DD` (prima zi a lunii următoare). */
export function formatCreditReset(resetOn: string): string {
  const date = new Date(`${resetOn}T12:00:00Z`);
  const month = new Intl.DateTimeFormat("ro-RO", { month: "long", timeZone: "UTC" }).format(date);
  return `1 ${month}`;
}

export function aiCreditsExhaustedMessage(used: number, limit: number, resetOn: string): string {
  return `Ai folosit creditele AI incluse luna aceasta (${used}/${limit}). Se resetează pe ${formatCreditReset(resetOn)}. Administratorul agenției poate solicita credite suplimentare.`;
}

/** Recunoaște codul `ai_credits_exhausted:used:limit:YYYY-MM-DD` ridicat de baza de date. */
export function parseAiCreditError(message: string | null | undefined): string | null {
  const match = (message ?? "").match(/ai_credits_exhausted:(\d+):(\d+):(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  return aiCreditsExhaustedMessage(Number(match[1]), Number(match[2]), match[3]);
}

export class AiCreditsExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiCreditsExhaustedError";
  }
}

export function aiCreditRatio(usage: Pick<AiCreditUsage, "used" | "limit">): number {
  if (usage.limit <= 0) return usage.used > 0 ? 1 : 0;
  return Math.min(1, usage.used / usage.limit);
}

export function shouldWarnAiCredits(usage: Pick<AiCreditUsage, "used" | "limit">): boolean {
  return usage.limit > 0 && usage.used / usage.limit >= AI_CREDITS_WARNING_RATIO;
}

/** Luna curentă (prima zi) în ora României, ca `YYYY-MM-DD`. */
export function romaniaMonthStart(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit" }).formatToParts(at);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}-01`;
}
