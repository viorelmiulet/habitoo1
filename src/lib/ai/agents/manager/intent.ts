/**
 * Router de intenții pentru Habitoo Manager Agent (Stage 17) — modul pur.
 *
 * Managerul nu inventează agenți: dacă o cerere cere o capabilitate care nu
 * există încă în Habitoo, intenția este `unavailable` și fluxul spune explicit
 * ce lipsește. Textul utilizatorului este DATĂ: aici se citesc doar cuvinte
 * cheie, niciodată instrucțiuni.
 */

export const MANAGER_AGENTS = ["crm", "acp", "marketing", "prospecting"] as const;

export type ManagerAgent = (typeof MANAGER_AGENTS)[number];

export const MANAGER_AGENT_LABELS: Record<ManagerAgent, string> = {
  crm: "CRM Agent",
  acp: "ACP Agent",
  marketing: "Marketing Agent",
  prospecting: "Prospecting Agent",
};

export const MANAGER_INTENTS = [
  /** Pregătire completă a unei proprietăți: context → ACP → marketing. */
  "property_promotion",
  /** Analiză ACP interpretată. */
  "acp_analysis",
  /** Doar texte de marketing. */
  "marketing_content",
  /** Lead-uri care necesită follow-up. */
  "crm_followup",
  /** Întrebări generale despre datele agenției. */
  "crm_question",
  /** Prospectare / proprietăți noi din surse externe. */
  "prospecting_discovery",
  /** Cerere care nu poate fi acoperită de agenții existenți. */
  "unavailable",
] as const;

export type ManagerIntent = (typeof MANAGER_INTENTS)[number];

export const MANAGER_INTENT_LABELS: Record<ManagerIntent, string> = {
  property_promotion: "Pregătire proprietate pentru promovare",
  acp_analysis: "Analiză comparativă de piață (ACP)",
  marketing_content: "Texte de marketing",
  crm_followup: "Lead-uri care necesită follow-up",
  crm_question: "Întrebare despre datele agenției",
  prospecting_discovery: "Prospectare proprietăți noi",
  unavailable: "Capabilitate indisponibilă",
};

export type ManagerRouting = {
  intent: ManagerIntent;
  /** Agenții implicați, în ordinea în care vor fi folosiți. */
  agents: ManagerAgent[];
  multiAgent: boolean;
  /** `true` când cererea cere explicit „nu aplica / nu modifica nimic”. */
  previewOnly: boolean;
  /** Referință de proprietate detectată în text (ex. „HB-120”), dacă există. */
  propertyReference: string | null;
  /** Explicație pentru capabilitățile inexistente. */
  unavailableReason: string | null;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

const PROMOTION = ["promovare", "promoveaz", "pregatest", "pregate", "pregatire", "listare"];
const MARKETING = ["descriere", "anunt", "text", "titlu", "postare", "social", "hashtag", "copy"];
const ACP = ["acp", "evaluare", "analiza comparativa", "comparabil", "pret corect", "cat valoreaza", "valoare"];
const FOLLOWUP = ["follow", "urmarire", "revenire", "de contactat", "restant", "neatins"];
const CRM = ["lead", "client", "cerere", "activitate", "task", "portofoliu", "proprietat"];
const PROSPECTING = ["prospect", "gaseste anunturi", "surse externe", "anunturi noi", "proprietati noi", "piata externa"];
const PREVIEW = ["nu aplica", "fara sa aplici", "nu modifica", "doar previzualizare", "nu salva", "nu persista", "fara modificari"];

/** Capabilități cerute frecvent, dar care NU există în Habitoo la Stage 17. */
const UNAVAILABLE: { words: string[]; reason: string }[] = [
  {
    words: ["publica pe", "publicare automata", "posteaz pe olx", "urca pe portal", "publica anuntul"],
    reason: "Publicarea automată pe portaluri sau pe rețele sociale nu este disponibilă.",
  },
  {
    words: ["trimite email", "trimite whatsapp", "trimite sms", "suna clientul", "campanie email"],
    reason: "Trimiterea automată de mesaje (email, WhatsApp, SMS) nu este disponibilă.",
  },
  {
    words: ["sterge propriet", "sterge lead", "sterge client", "schimba pretul", "modifica pretul"],
    reason:
      "Ștergerile și modificarea prețului nu pot fi făcute de agentul AI; le faci manual în CRM.",
  },
  {
    words: ["semneaz", "contract semnat automat"],
    reason: "Semnarea contractelor nu este disponibilă pentru agentul AI.",
  },
];

const REFERENCE = /\b([A-Z]{2,4}-\d{2,6})\b/;

/** Detectează referința de proprietate exact cum apare (fără normalizare). */
export function detectPropertyReference(text: string): string | null {
  const match = REFERENCE.exec(text.toUpperCase());
  return match ? match[1]! : null;
}

/**
 * Rutarea deterministă a cererii. Rezultatul decide planul; modelul nu poate
 * schimba lista de agenți sau permisiunile.
 */
export function routeManagerRequest(request: string): ManagerRouting {
  const text = normalize(request);
  const previewOnly = hasAny(text, PREVIEW);
  const propertyReference = detectPropertyReference(request);

  for (const rule of UNAVAILABLE) {
    if (hasAny(text, rule.words)) {
      return {
        intent: "unavailable",
        agents: [],
        multiAgent: false,
        previewOnly,
        propertyReference,
        unavailableReason: rule.reason,
      };
    }
  }

  const wantsPromotion = hasAny(text, PROMOTION);
  const wantsMarketing = hasAny(text, MARKETING);
  const wantsAcp = hasAny(text, ACP);
  const wantsFollowup = hasAny(text, FOLLOWUP);
  const wantsProspecting = hasAny(text, PROSPECTING);

  if (wantsProspecting) {
    return {
      intent: "prospecting_discovery",
      agents: wantsMarketing || wantsPromotion ? ["prospecting", "crm", "marketing"] : ["prospecting", "crm"],
      multiAgent: true,
      previewOnly,
      propertyReference,
      unavailableReason: null,
    };
  }

  if (wantsPromotion || (wantsMarketing && wantsAcp)) {
    return {
      intent: "property_promotion",
      agents: ["crm", "acp", "marketing"],
      multiAgent: true,
      previewOnly,
      propertyReference,
      unavailableReason: null,
    };
  }

  if (wantsAcp) {
    return {
      intent: "acp_analysis",
      agents: ["crm", "acp"],
      multiAgent: true,
      previewOnly,
      propertyReference,
      unavailableReason: null,
    };
  }

  if (wantsMarketing) {
    return {
      intent: "marketing_content",
      agents: ["crm", "marketing"],
      multiAgent: true,
      previewOnly,
      propertyReference,
      unavailableReason: null,
    };
  }

  if (wantsFollowup) {
    return {
      intent: "crm_followup",
      agents: ["crm"],
      multiAgent: false,
      previewOnly,
      propertyReference,
      unavailableReason: null,
    };
  }

  if (hasAny(text, CRM) || text.trim() !== "") {
    return {
      intent: "crm_question",
      agents: ["crm"],
      multiAgent: false,
      previewOnly,
      propertyReference,
      unavailableReason: null,
    };
  }

  return {
    intent: "unavailable",
    agents: [],
    multiAgent: false,
    previewOnly,
    propertyReference,
    unavailableReason: "Cererea este goală. Scrie ce ai nevoie.",
  };
}
