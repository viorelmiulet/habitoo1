import type { AppRole } from "@/hooks/use-session";
import type { AiFeatureKey } from "./ai/features/keys";

export type PlannedGuide = { id: string; title: string; group: string; trigger: string; access: string; roles: AppRole[]; feature: AiFeatureKey | null };

/** Etapa finală: toate paginile pentru agent și administrator au ghiduri disponibile. */
export const plannedGuides: PlannedGuide[] = [];
