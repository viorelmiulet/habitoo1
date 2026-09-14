/**
 * CRM Insights — determinist și explicabil (Stage 14).
 *
 * Scorul de prioritate al unui lead se calculează aici, în cod, cu factori
 * declarați. Modelul poate EXPLICA scorul, dar nu îl produce și nu inventează
 * metrici. Aceleași date → același scor, mereu.
 */

export type LeadInsightInput = {
  id: string;
  name: string;
  stage: string;
  score: number | null;
  value: number | null;
  source: string | null;
  createdAt: string;
  lastInteractionAt: string | null;
  nextFollowupAt: string | null;
  assignedTo: string | null;
};

export type InsightFactor = {
  label: string;
  points: number;
  detail: string;
};

export type LeadInsight = {
  id: string;
  name: string;
  stage: string;
  priority: number;
  factors: InsightFactor[];
  daysSinceContact: number | null;
  followupOverdueDays: number | null;
  /** `true` când nu există follow-up planificat și nici contact recent. */
  needsFollowUp: boolean;
  stale: boolean;
};

const OPEN_STAGES = new Set([
  "new",
  "contacted",
  "qualified",
  "viewing",
  "offer",
  "negotiation",
  "transaction",
]);

/** Etapele cu intenție mai avansată primesc mai multe puncte. */
const STAGE_POINTS: Record<string, number> = {
  new: 12,
  contacted: 16,
  qualified: 22,
  viewing: 26,
  offer: 30,
  negotiation: 32,
  transaction: 28,
  won: 0,
  lost: 0,
};

export function daysBetween(from: string | null, now: Date): number | null {
  if (!from) return null;
  const time = Date.parse(from);
  if (!Number.isFinite(time)) return null;
  return Math.floor((now.getTime() - time) / 86_400_000);
}

export function isOpenStage(stage: string): boolean {
  return OPEN_STAGES.has(stage);
}

/** Scor 0–100 cu breakdown: intenție, recență, buget, follow-up, sursă. */
export function scoreLeadPriority(lead: LeadInsightInput, now: Date = new Date()): LeadInsight {
  const factors: InsightFactor[] = [];
  const daysSinceContact = daysBetween(lead.lastInteractionAt ?? lead.createdAt, now);
  const followupDays = daysBetween(lead.nextFollowupAt, now);
  const followupOverdueDays = followupDays !== null && followupDays > 0 ? followupDays : null;

  const stagePoints = STAGE_POINTS[lead.stage] ?? 10;
  factors.push({
    label: "Etapă",
    points: stagePoints,
    detail: `Etapa curentă: ${lead.stage}`,
  });

  let recencyPoints = 0;
  if (daysSinceContact === null) {
    recencyPoints = 8;
    factors.push({ label: "Recență", points: 8, detail: "Fără interacțiune înregistrată" });
  } else if (daysSinceContact >= 30) {
    recencyPoints = 24;
    factors.push({
      label: "Recență",
      points: 24,
      detail: `${daysSinceContact} zile fără contact`,
    });
  } else if (daysSinceContact >= 14) {
    recencyPoints = 18;
    factors.push({
      label: "Recență",
      points: 18,
      detail: `${daysSinceContact} zile fără contact`,
    });
  } else if (daysSinceContact >= 7) {
    recencyPoints = 12;
    factors.push({
      label: "Recență",
      points: 12,
      detail: `${daysSinceContact} zile fără contact`,
    });
  } else {
    recencyPoints = 4;
    factors.push({
      label: "Recență",
      points: 4,
      detail: `Contactat acum ${daysSinceContact} zile`,
    });
  }

  let followupPoints = 0;
  if (followupOverdueDays !== null) {
    followupPoints = Math.min(20, 8 + followupOverdueDays);
    factors.push({
      label: "Follow-up",
      points: followupPoints,
      detail: `Follow-up depășit cu ${followupOverdueDays} zile`,
    });
  } else if (lead.nextFollowupAt === null) {
    followupPoints = 10;
    factors.push({ label: "Follow-up", points: 10, detail: "Niciun follow-up planificat" });
  } else {
    factors.push({ label: "Follow-up", points: 0, detail: "Follow-up planificat" });
  }

  let valuePoints = 0;
  if (typeof lead.value === "number" && lead.value > 0) {
    valuePoints = lead.value >= 200_000 ? 14 : lead.value >= 100_000 ? 10 : 6;
    factors.push({
      label: "Valoare estimată",
      points: valuePoints,
      detail: `Valoare lead: ${Math.round(lead.value)}`,
    });
  }

  let manualPoints = 0;
  if (typeof lead.score === "number" && lead.score > 0) {
    manualPoints = Math.min(10, Math.round(lead.score / 10));
    factors.push({
      label: "Scor CRM",
      points: manualPoints,
      detail: `Scorul introdus în CRM: ${lead.score}`,
    });
  }

  const total = stagePoints + recencyPoints + followupPoints + valuePoints + manualPoints;
  const priority = isOpenStage(lead.stage) ? Math.max(0, Math.min(100, total)) : 0;

  return {
    id: lead.id,
    name: lead.name,
    stage: lead.stage,
    priority,
    factors,
    daysSinceContact,
    followupOverdueDays,
    needsFollowUp:
      isOpenStage(lead.stage) &&
      (lead.nextFollowupAt === null || followupOverdueDays !== null),
    stale:
      isOpenStage(lead.stage) && daysSinceContact !== null && daysSinceContact >= 7,
  };
}

/** Leadurile fără follow-up planificat sau cu follow-up depășit. */
export function leadsWithoutFollowUp(
  leads: LeadInsightInput[],
  now: Date = new Date(),
): LeadInsight[] {
  return leads
    .map((lead) => scoreLeadPriority(lead, now))
    .filter((insight) => insight.needsFollowUp)
    .sort((a, b) => b.priority - a.priority);
}

/** Leadurile stagnante: deschise, dar fără contact de cel puțin `days` zile. */
export function stagnantLeads(
  leads: LeadInsightInput[],
  days: number,
  now: Date = new Date(),
): LeadInsight[] {
  return leads
    .map((lead) => scoreLeadPriority(lead, now))
    .filter(
      (insight) =>
        isOpenStage(insight.stage) &&
        insight.daysSinceContact !== null &&
        insight.daysSinceContact >= days,
    )
    .sort((a, b) => (b.daysSinceContact ?? 0) - (a.daysSinceContact ?? 0));
}

/** Prioritățile zilei: cele mai mari scoruri, doar pentru leaduri deschise. */
export function priorityLeads(
  leads: LeadInsightInput[],
  limit = 10,
  now: Date = new Date(),
): LeadInsight[] {
  return leads
    .map((lead) => scoreLeadPriority(lead, now))
    .filter((insight) => insight.priority > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, Math.max(1, limit));
}
