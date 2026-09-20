/**
 * Ecran de indisponibilitate pentru o funcție AI neactivată pentru agenție.
 * Funcțiile AI sunt oprite implicit și se activează individual, per agenție,
 * de către administratorul platformei.
 */
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { InlineLoading } from "@/components/app/LoadingState";
import { EmptyState } from "@/components/app/EmptyState";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { AI_FEATURE_LABELS, type AiFeatureKey } from "@/lib/ai/features/keys";

export function AiFeatureGate({
  feature,
  children,
}: {
  feature: AiFeatureKey;
  children: ReactNode;
}) {
  const { isEnabled, isLoading } = useAiFeatures();

  if (isLoading) return <InlineLoading label="Se verifică disponibilitatea funcției…" />;
  if (!isEnabled(feature)) {
    return (
      <EmptyState
        icon={Lock}
        title={`${AI_FEATURE_LABELS[feature]} nu este activată`}
        description="Această funcție nu este activată pentru agenția ta. Contactează administratorul platformei."
      />
    );
  }
  return <>{children}</>;
}
