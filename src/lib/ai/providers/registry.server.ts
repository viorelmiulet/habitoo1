/**
 * Selecția providerului AI de text.
 *
 * Principal: Gemini (`GEMINI_API_KEY`). Rezervă: Mistral (`MISTRAL_API_KEY`),
 * folosită doar la erori tranzitorii, prin `withAiProviderFallback`.
 * Modelele se aleg din SuperAdmin → AI („Modele AI”), cu cache de 60 s.
 */
import type { AIProvider } from "./types";
import { createGeminiProvider } from "./gemini.server";
import { createMistralProvider } from "./mistral.server";
import {
  AI_MODEL_DEFAULTS,
  normalizeAiModelSettings,
  type AiModelClass,
  type AiModelSettings,
  type AiModelSlot,
} from "./models";

export type { AiModelClass, AiModelSettings, AiModelSlot } from "./models";
export { AI_MODEL_DEFAULTS } from "./models";

export type AiProviderId = "gemini" | "mistral";

export type AiProviderStatus = {
  configured: boolean;
  provider: AiProviderId;
  model: string;
  /** Providerii pregătiți arhitectural, dar neimplementați încă. */
  plannedProviders: string[];
  providers: {
    id: AiProviderId;
    role: "primary" | "fallback";
    model: string;
    configured: boolean;
    /** Doar pentru Gemini: modelele per clasă. */
    models?: { fast: string; standard: string };
  }[];
};

export const AI_MODEL_SETTINGS_TTL_MS = 60_000;

type Loader = () => Promise<Partial<Record<AiModelSlot, string | null>> | null>;

async function defaultLoader(): Promise<Partial<Record<AiModelSlot, string | null>> | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("ai_model_settings")
    .select("fast_model,standard_model,fallback_model")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { fast: data.fast_model, standard: data.standard_model, fallback: data.fallback_model };
}

let loader: Loader = defaultLoader;
let cache: { at: number; value: AiModelSettings } | null = null;

/** Doar pentru teste: înlocuiește citirea din baza de date. */
export function setAiModelSettingsLoader(next: Loader | null): void {
  loader = next ?? defaultLoader;
  cache = null;
}

export function invalidateAiModelSettingsCache(): void {
  cache = null;
}

/** Modelele active (cele salvate sau implicite), din cache sau din DB. */
export async function loadAiModelSettings(): Promise<AiModelSettings> {
  if (cache && Date.now() - cache.at < AI_MODEL_SETTINGS_TTL_MS) return cache.value;
  let value: AiModelSettings;
  try {
    value = normalizeAiModelSettings(await loader());
  } catch (error) {
    console.error("[ai] model settings unavailable, using defaults", (error as Error)?.message ?? "");
    value = { ...AI_MODEL_DEFAULTS };
  }
  cache = { at: Date.now(), value };
  return value;
}

function cachedSettings(): AiModelSettings {
  return cache?.value ?? { ...AI_MODEL_DEFAULTS };
}

function geminiKey(): string | null {
  return process.env["GEMINI_API_KEY"]?.trim() || null;
}

function mistralKey(): string | null {
  return process.env["MISTRAL_API_KEY"]?.trim() || null;
}

/** Provider care citește modelul salvat abia la apel (cache 60 s). */
function lazyProvider(
  id: AiProviderId,
  slot: AiModelSlot,
  make: (model: string) => AIProvider,
  fallback?: AIProvider,
): AIProvider {
  let model = cachedSettings()[slot];
  return {
    id,
    get model() {
      return model;
    },
    supportsTools: true,
    ...(fallback ? { fallback } : {}),
    async generate(request) {
      model = (await loadAiModelSettings())[slot];
      return make(model).generate(request);
    },
  };
}

/** Creează direct un provider pentru un model (butonul „Testează”). */
export function createAiProviderForSlot(slot: AiModelSlot, model: string): AIProvider | null {
  if (slot === "fallback") {
    const key = mistralKey();
    return key ? createMistralProvider(key, model) : null;
  }
  const key = geminiKey();
  return key ? createGeminiProvider(key, model) : null;
}

/** Starea providerului, fără să expună vreodată cheile. */
export async function aiProviderStatus(): Promise<AiProviderStatus> {
  const settings = await loadAiModelSettings();
  const gemini = Boolean(geminiKey());
  const mistral = Boolean(mistralKey());
  return {
    configured: gemini || mistral,
    provider: gemini || !mistral ? "gemini" : "mistral",
    model: gemini || !mistral ? settings.standard : settings.fallback,
    plannedProviders: [],
    providers: [
      {
        id: "gemini",
        role: "primary",
        model: settings.standard,
        configured: gemini,
        models: { fast: settings.fast, standard: settings.standard },
      },
      { id: "mistral", role: "fallback", model: settings.fallback, configured: mistral },
    ],
  };
}

export function isAiConfigured(): boolean {
  return Boolean(geminiKey() || mistralKey());
}

/**
 * Providerul de text pentru clasa de sarcină sau `null` când nu există chei.
 * MiniMax nu mai este folosit pentru text.
 */
export function resolveAiProvider(modelClass: AiModelClass = "standard"): AIProvider | null {
  const gKey = geminiKey();
  const mKey = mistralKey();
  const fallback = mKey
    ? lazyProvider("mistral", "fallback", (model) => createMistralProvider(mKey, model))
    : undefined;
  if (!gKey) return fallback ?? null;
  return lazyProvider("gemini", modelClass, (model) => createGeminiProvider(gKey, model), fallback);
}
