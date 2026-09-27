/** Starea afișată agenției în cardul Properstar. */
export type ProperstarFeedStatus =
  | { kind: "not_activated"; label: string }
  | { kind: "no_selection"; label: string }
  | { kind: "included"; label: string; count: number };

export function properstarFeedStatus(input: {
  activated: boolean;
  selected: number;
  active: number;
}): ProperstarFeedStatus {
  if (!input.activated) return { kind: "not_activated", label: "Neactivat — solicită activarea" };
  if (input.selected === 0)
    return { kind: "no_selection", label: "Activat, dar niciun anunț bifat pentru Properstar" };
  return {
    kind: "included",
    count: input.active,
    label: `Inclus automat în feedul Properstar — ${input.active} ${input.active === 1 ? "anunț" : "anunțuri"}`,
  };
}
