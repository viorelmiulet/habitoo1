/**
 * Stage 8: reguli pure de protecție pentru rulările ACP.
 *
 * Sunt funcții deterministe, fără acces la bază de date, ca să poată fi
 * testate direct: validarea surselor, protecția la rulări duplicate și
 * imutabilitatea versiunilor deja livrate (raport generat sau interpretare AI).
 */
import { z } from "zod";
import { ACP_SOURCE_TYPES } from "./config";

/** Numai sursele cunoscute sunt acceptate; orice altă cheie este respinsă. */
export const acpSourcesSchema = z
  .record(z.enum(ACP_SOURCE_TYPES), z.boolean())
  .default({ own_properties: true })
  .transform((value) => {
    const out: Record<string, boolean> = {};
    for (const key of ACP_SOURCE_TYPES) {
      if (value[key] !== undefined) out[key] = Boolean(value[key]);
    }
    return Object.keys(out).length > 0 ? out : { own_properties: true };
  });

/** Fereastra în care un al doilea click pe „Pornește ACP" reutilizează rularea în curs. */
export const ACP_DUPLICATE_RUN_WINDOW_SECONDS = 120;

/**
 * `true` dacă o analiză pornită deja pentru aceeași proprietate trebuie
 * reutilizată în loc să creăm una nouă (dublu-click, refresh, retry).
 */
export function shouldReuseRunningAnalysis(
  running: { status: string; createdAt: string } | null,
  now: Date = new Date(),
): boolean {
  if (!running) return false;
  if (running.status !== "running") return false;
  const started = Date.parse(running.createdAt);
  if (!Number.isFinite(started)) return false;
  const ageSeconds = (now.getTime() - started) / 1000;
  return ageSeconds >= 0 && ageSeconds <= ACP_DUPLICATE_RUN_WINDOW_SECONDS;
}

export type AcpInPlaceRecalcCheck = {
  status: string;
  /** Există un raport livrat pentru această versiune. */
  hasReport: boolean;
  /** Există o interpretare AI salvată pentru această versiune. */
  hasAiInsight: boolean;
};

export type AcpInPlaceRecalcVerdict =
  | { allowed: true }
  | { allowed: false; reason: "running" | "locked"; message: string };

/**
 * O versiune deja livrată (cu raport sau interpretare AI) rămâne imutabilă:
 * recalcularea ei se face doar ca versiune nouă. La fel, o rulare în curs nu
 * poate fi suprascrisă de un al doilea request.
 */
export function canRecalculateInPlace(input: AcpInPlaceRecalcCheck): AcpInPlaceRecalcVerdict {
  if (input.status === "running") {
    return {
      allowed: false,
      reason: "running",
      message: "Analiza rulează deja. Așteaptă finalizarea ei.",
    };
  }
  if (input.hasReport || input.hasAiInsight) {
    return {
      allowed: false,
      reason: "locked",
      message:
        "Această versiune are deja un livrabil (raport sau interpretare AI) și rămâne neschimbată. Folosește opțiunea de recalculare cu date actuale pentru o versiune nouă.",
    };
  }
  return { allowed: true };
}

export type AcpTargetCheck = {
  /** Momentul retragerii din portofoliu, dacă proprietatea a fost arhivată. */
  archivedAt: string | null;
  status: string | null;
};

export type AcpTargetVerdict =
  | { allowed: true }
  | { allowed: false; reason: "archived"; message: string };

/**
 * Stage 9: o proprietate retrasă din portofoliu nu mai poate porni o rulare
 * nouă (nici analiză nouă, nici versiune nouă). Analizele deja existente rămân
 * accesibile ca istoric, dar nu producem evaluări noi pentru o ofertă retrasă.
 */
export function canRunAcpForTarget(input: AcpTargetCheck): AcpTargetVerdict {
  const archived = Boolean(input.archivedAt) || input.status === "archived";
  if (archived) {
    return {
      allowed: false,
      reason: "archived",
      message:
        "Proprietatea este arhivată. Reactivează-o în portofoliu pentru a porni o analiză comparativă nouă.",
    };
  }
  return { allowed: true };
}
