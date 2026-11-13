/** Ciorna mesajului către client: AI (model rapid, 1 credit) sau șablon simplu ne-AI. */
import type { AIProvider } from "@/lib/ai/providers/types";
import { sanitizeDraft, type DraftProperty } from "@/lib/ai/lead-assist/schema";
import { templateMatchMessage } from "./plan";

export type DraftDeps = {
  provider: Pick<AIProvider, "generate"> | null;
  isFeatureEnabled: (org: string) => Promise<boolean>;
  creditsBlocked: (org: string) => Promise<string | null>;
  withCredits: <T>(actor: { organizationId: string; userId: string }, run: () => Promise<T>, isSuccess: (r: T) => boolean) => Promise<T>;
};
export type DraftContext = { organizationId: string; userId: string; clientFirstName: string | null; property: DraftProperty; link: string | null };
export type DraftResult = { text: string; isAi: boolean; notice: string | null };

export const MATCH_DRAFT_SYSTEM = `Ești asistentul Habitoo pentru agenți imobiliari din România. Scrii un mesaj scurt (2–4 fraze), prietenos, în română, de la agent către client, despre o proprietate care se potrivește cu cererea lui.
Reguli: folosește DOAR faptele primite. Nu inventa prețuri, suprafețe, adrese, disponibilitate sau alte detalii. Dacă primești un link, include-l exact. Propune o vizionare, fără o oră anume. Fără semnătură și fără nume de agent. Răspunde doar cu textul mesajului.`;

export function buildMatchDraftRequest(ctx: DraftContext) {
  const p = ctx.property;
  const facts = { client: ctx.clientFirstName, titlu: p.title, tranzactie: p.transaction_kind === "rent" ? "închiriere" : "vânzare", tip: p.property_type, pret: p.price, moneda: p.currency, camere: p.rooms, suprafata_utila: p.usable_surface ?? p.surface, etaj: p.floor, oras: p.city, balcon: p.balcony, descriere: p.description?.slice(0, 800) ?? null, link: ctx.link };
  return { system: MATCH_DRAFT_SYSTEM, messages: [{ role: "user" as const, content: JSON.stringify(facts) }], tools: [], maxOutputTokens: 600 };
}

export async function buildAlertDraft(deps: DraftDeps, ctx: DraftContext): Promise<DraftResult> {
  const template = templateMatchMessage({ clientFirstName: ctx.clientFirstName, property: ctx.property, link: ctx.link });
  const fallback = (notice: string | null): DraftResult => ({ text: template, isAi: false, notice });
  if (!deps.provider || !(await deps.isFeatureEnabled(ctx.organizationId))) return fallback(null);
  const blocked = await deps.creditsBlocked(ctx.organizationId);
  if (blocked) return fallback(blocked);
  try {
    const text = await deps.withCredits(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      async () => {
        const r = await deps.provider!.generate(buildMatchDraftRequest(ctx));
        const clean = sanitizeDraft(r.text, ctx.property, ctx.link ?? "");
        return clean && ctx.link && !clean.includes(ctx.link) ? `${clean}\n${ctx.link}` : clean;
      },
      (t) => !!t,
    );
    return text ? { text, isAi: true, notice: null } : fallback("Ciorna AI nu a putut fi verificată; am pus un mesaj simplu.");
  } catch (e) {
    const { AiCreditsExhaustedError } = await import("@/lib/ai/credits/credits");
    return fallback(e instanceof AiCreditsExhaustedError ? e.message : "Ciorna AI nu a putut fi generată; am pus un mesaj simplu.");
  }
}
