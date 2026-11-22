import { syncFloor } from "@/lib/property-floor";
import type { ListingSuggestionApply } from "./ListingCheckDialog";

export type SuggestionSetters = {
  setText: (patch: { title?: string; description?: string }) => void;
  setDetails: (patch: Record<string, unknown>) => void;
};

/** Completează doar starea formularului; salvarea rămâne acțiunea agentului. */
export function applyListingSuggestion(s: ListingSuggestionApply, set: SuggestionSetters) {
  if (s.kind === "title") return set.setText({ title: s.value });
  if (s.kind === "description") return set.setText({ description: s.value });
  if (s.field === "floor") return set.setDetails(syncFloor(null, s.value));
  set.setDetails({ [s.field]: s.value });
}
