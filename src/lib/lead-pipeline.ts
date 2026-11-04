/** Etapa afișată implicit pe telefon: prima coloană care are lead-uri. */
export function defaultMobileStage<S extends string>(
  columns: readonly S[],
  leads: readonly { stage: S }[],
): S | null {
  return columns.find((s) => leads.some((l) => l.stage === s)) ?? columns[0] ?? null;
}

/** Etapa aleasă pe telefon rămâne cât timp e o coloană validă; altfel revine la implicit. */
export function resolveMobileStage<S extends string>(
  chosen: S | null,
  columns: readonly S[],
  leads: readonly { stage: S }[],
): S | null {
  if (chosen && columns.includes(chosen)) return chosen;
  return defaultMobileStage(columns, leads);
}

/** Aceeași decizie pentru tragere și pentru selectorul din panou. */
export function stageChangeAction(from: string, to: string): "none" | "ask-lost-reason" | "move" {
  if (from === to) return "none";
  return to === "lost" ? "ask-lost-reason" : "move";
}
