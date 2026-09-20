import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { emptyAiFeatureMap, type AiFeatureKey, type AiFeatureMap } from "@/lib/ai/features/keys";
import { listMyAiFeatures } from "@/lib/ai/features/features.functions";

/** Funcțiile AI activate pentru agenția utilizatorului curent. */
export function useAiFeatures() {
  const load = useServerFn(listMyAiFeatures);
  const query = useQuery({
    queryKey: ["ai-features", "mine"],
    queryFn: () => load(),
    staleTime: 60_000,
  });
  const features: AiFeatureMap = query.data ?? emptyAiFeatureMap();
  return {
    features,
    isLoading: query.isLoading,
    isEnabled: (key: AiFeatureKey) => features[key] === true,
  };
}
