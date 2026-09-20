/**
 * Funcțiile AI activabile individual per agenție.
 *
 * Toate sunt oprite implicit: lipsa unui rând în `organization_ai_features`
 * înseamnă „dezactivat”. Doar superadminul le poate activa.
 */
export const AI_FEATURE_KEYS = [
  "ai_manager",
  "ai_crm",
  "ai_marketing",
  "ai_assistant",
  "ai_media",
  "acp_ai",
] as const;

export type AiFeatureKey = (typeof AI_FEATURE_KEYS)[number];

export type AiFeatureMap = Record<AiFeatureKey, boolean>;

export const AI_FEATURES: { key: AiFeatureKey; label: string; description: string }[] = [
  {
    key: "ai_manager",
    label: "Habitoo Manager",
    description: "Orchestrează agenții AI pentru cereri complexe.",
  },
  {
    key: "ai_crm",
    label: "AI CRM",
    description: "Răspunde la întrebări despre clienți, cereri și lead-uri.",
  },
  {
    key: "ai_marketing",
    label: "AI Marketing",
    description: "Generează titluri, descrieri și postări pentru proprietăți.",
  },
  {
    key: "ai_assistant",
    label: "Habitoo AI",
    description: "Asistentul de chat cu datele agenției.",
  },
  {
    key: "ai_media",
    label: "Studio AI",
    description: "Îmbunătățirea fotografiilor, video din poză și imagini de marketing.",
  },
  {
    key: "acp_ai",
    label: "Analiză AI în ACP",
    description: "Comentariul AI de pe o analiză comparativă de preț.",
  },
];

export const AI_FEATURE_LABELS: Record<AiFeatureKey, string> = Object.fromEntries(
  AI_FEATURES.map((feature) => [feature.key, feature.label]),
) as Record<AiFeatureKey, string>;

/** Harta „totul oprit”, folosită ca punct de plecare și ca fallback sigur. */
export function emptyAiFeatureMap(): AiFeatureMap {
  return Object.fromEntries(AI_FEATURE_KEYS.map((key) => [key, false])) as AiFeatureMap;
}

export function isAiFeatureKey(value: unknown): value is AiFeatureKey {
  return typeof value === "string" && (AI_FEATURE_KEYS as readonly string[]).includes(value);
}

/** Mesaj unic pentru orice funcție AI neactivată pentru agenție. */
export function aiFeatureDisabledMessage(key: AiFeatureKey): string {
  return `${AI_FEATURE_LABELS[key]} nu este activată pentru agenția ta. Contactează administratorul platformei.`;
}
