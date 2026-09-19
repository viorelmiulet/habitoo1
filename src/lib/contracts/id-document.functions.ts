/**
 * Citirea actului de identitate — un singur punct de intrare pe server.
 *
 * Regulă absolută: imaginea actului NU este niciodată păstrată — nici în bucket,
 * nici în tabel, nici în fișier temporar, nici în loguri. Există doar în memorie
 * pe durata cererii și este eliberată la final. Funcția nu scrie în baza de date
 * decât rândul de consum AI (fără octeți de imagine și fără date din act).
 *
 * Deciziile de validitate rămân la cifrele de control: modelul doar transcrie.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkAiQuota } from "@/lib/ai/gateway/gateway.server";
import { writeAiUsage } from "@/lib/ai/usage/tracking.server";
import { emptyReading, readMrz, type IdDocumentReading } from "@/lib/contracts/id/read";
import { idQualityMessages, type IdQualityReason } from "@/lib/contracts/id/quality";
import { prepareIdUpload } from "@/lib/contracts/id/prepare.server";
import { readFrontFromImage, readMrzFromImage, type VisionUsage } from "@/lib/contracts/id/vision.server";
import { detectFrontConflicts, type IdFieldConflict, type IdFrontReading } from "@/lib/contracts/id/vision.parse";

/** Numărul maxim de citiri de act pe utilizator pe oră. */
export const ID_DOCUMENT_ATTEMPTS_PER_HOUR = 20;
const ATTEMPTS_WINDOW_SECONDS = 3600;

const imageSchema = z.object({
  contentType: z.string().trim().max(100),
  base64: z.string().min(1),
});

const inputSchema = z
  .object({
    mrz: z.string().trim().min(1).max(200).optional(),
    /** Spatele actului: zona citibilă automat. */
    back: imageSchema.optional(),
    /** Fața actului: câmpuri fără cifră de control, de confirmat manual. */
    front: imageSchema.optional(),
  })
  .refine((data) => Boolean(data.mrz || data.back || data.front), {
    message: "Trimite textul MRZ sau fotografia actului.",
  });

export type IdDocumentReadResult =
  | { state: "not_configured"; message: string }
  | { state: "rate_limited"; message: string }
  | { state: "invalid"; reason: string; message: string }
  | { state: "needs_better_photo"; reasons: IdQualityReason[]; messages: string[] }
  | {
      state: "read";
      reading: IdDocumentReading;
      front: IdFrontReading | null;
      conflicts: IdFieldConflict[];
      quality: IdQualityReason[];
      messages: string[];
    };

type Ctx = {
  supabase: {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
};

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Plafon separat de încercări pe utilizator pe oră, aplicat „fail closed”. */
async function withinAttemptCap(admin: unknown, userId: string): Promise<boolean> {
  const client = admin as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  try {
    const { data, error } = await client.rpc("rate_limit_hit", {
      _bucket: `id_document:user:hour:${userId}`,
      _limit: ID_DOCUMENT_ATTEMPTS_PER_HOUR,
      _window_seconds: ATTEMPTS_WINDOW_SECONDS,
    });
    if (error || typeof data !== "boolean") return false;
    return data;
  } catch {
    return false;
  }
}

function sumUsage(...parts: (VisionUsage | null)[]): VisionUsage {
  return parts.filter(Boolean).reduce<VisionUsage>(
    (acc, part) => ({
      calls: acc.calls + (part as VisionUsage).calls,
      inputTokens:
        (part as VisionUsage).inputTokens === null
          ? acc.inputTokens
          : (acc.inputTokens ?? 0) + ((part as VisionUsage).inputTokens as number),
      outputTokens:
        (part as VisionUsage).outputTokens === null
          ? acc.outputTokens
          : (acc.outputTokens ?? 0) + ((part as VisionUsage).outputTokens as number),
    }),
    { calls: 0, inputTokens: null, outputTokens: null },
  );
}

/** Spune interfeței dacă citirea automată a actului este configurată. */
export const getIdReadingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ configured: Boolean(process.env["GEMINI_API_KEY"]) }));



export const readIdDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<IdDocumentReadResult> => {
    const ctx = context as unknown as Ctx;

    /* Calea fără model: textul MRZ intră direct în parserul determinist. */
    if (data.mrz && !data.back && !data.front) {
      const reading = readMrz(data.mrz);
      if (reading.failures.includes("mrz_line_count") || reading.failures.includes("mrz_line_length")) {
        const blank = emptyReading(reading.failures[0] as string);
        const reason = blank.failures[0] as string;
        return { state: "invalid", reason, message: "Textul MRZ nu are forma corectă (trei rânduri de 30 de caractere)." };
      }
      return { state: "read", reading, front: null, conflicts: [], quality: [], messages: [] };
    }

    const { data: org } = await ctx.supabase.rpc("current_org");
    if (!org || typeof org !== "string") {
      return { state: "invalid", reason: "no_organization", message: "Agenția nu este configurată." };
    }

    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) {
      return {
        state: "not_configured",
        message: "Citirea automată a actului nu este configurată. Completează datele manual.",
      };
    }

    const admin = await adminClient();
    const actor = { userId: ctx.userId, organizationId: org };
    const quota = await checkAiQuota(admin as never, actor as never, "workflow");
    if (!quota.allowed) {
      return { state: "rate_limited", message: quota.message ?? "Ai atins limita de cereri AI." };
    }
    if (!(await withinAttemptCap(admin, ctx.userId))) {
      return {
        state: "rate_limited",
        message: `Ai atins limita de citiri de act (${ID_DOCUMENT_ATTEMPTS_PER_HOUR} pe oră). Încearcă din nou mai târziu.`,
      };
    }

    const { createGeminiProvider, GEMINI_DEFAULT_MODEL } = await import("@/lib/ai/providers/gemini.server");
    const provider = createGeminiProvider(apiKey, process.env["GEMINI_MODEL"]?.trim() || GEMINI_DEFAULT_MODEL);

    const started = Date.now();
    let usage: VisionUsage = { calls: 0, inputTokens: null, outputTokens: null };
    let success = false;
    try {
      /* Spatele: zona citibilă automat, verificată de cifrele de control. */
      let reading: IdDocumentReading | null = null;
      let quality: IdQualityReason[] = [];
      if (data.back) {
        const prepared = await prepareIdUpload(data.back);
        if (!prepared.ok) {
          return { state: "needs_better_photo", reasons: [prepared.reason], messages: idQualityMessages([prepared.reason]) };
        }
        const outcome = await readMrzFromImage(provider, prepared);
        usage = sumUsage(usage, outcome.usage);
        reading = outcome.reading;
        quality = outcome.quality;
        if (!reading) {
          return { state: "needs_better_photo", reasons: quality, messages: idQualityMessages(quality) };
        }
      } else if (data.mrz) {
        reading = readMrz(data.mrz);
      }

      /* Fața: câmpuri fără cifră de control, întotdeauna „de confirmat”. */
      let front: IdFrontReading | null = null;
      if (data.front) {
        const prepared = await prepareIdUpload(data.front);
        if (!prepared.ok) {
          quality = [...quality, prepared.reason];
        } else {
          const outcome = await readFrontFromImage(provider, prepared);
          usage = sumUsage(usage, outcome.usage);
          front = outcome.front;
          quality = [...quality, ...outcome.quality];
        }
      }

      if (!reading) {
        /* Doar fața a fost trimisă: nimic nu este verificat matematic. */
        reading = emptyReading("mrz_missing");
      }

      const conflicts = front ? detectFrontConflicts(reading.fields, front.fields) : [];
      success = true;
      return { state: "read", reading, front, conflicts, quality, messages: idQualityMessages(quality) };
    } finally {
      if (usage.calls > 0) {
        /* Consum contorizat cu tokenii reali; necunoscut rămâne necunoscut. */
        await writeAiUsage(admin as never, {
          organization_id: org,
          user_id: ctx.userId,
          provider: provider.id,
          model: provider.model,
          capability: "id_document_vision",
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          latency_ms: Date.now() - started,
          success,
          tool_calls: usage.calls,
        });
      }
    }
  });
