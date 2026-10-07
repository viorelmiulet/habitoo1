/**
 * Lead-uri VDI.ro (secțiunea „Preluare leaduri” din documentație).
 * Reguli pure: semnătura webhook-ului, parsarea lead-ului și procesarea lui
 * cu dependențe injectate (testabile fără rețea și fără bază de date).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const VDI_LEAD_TYPES = {
  mesaj: "Mesaj",
  email: "Email",
  cerere_sunat: "Cerere de apel",
  oferta_pret: "Ofertă de preț",
  licitatie: "Înscriere la licitație",
  chatbot: "Chatbot",
  site_agentie: "Site agenție",
  manual: "Lead manual",
  contact_agentie: "Contact agenție",
} as const;
export type VdiLeadType = keyof typeof VDI_LEAD_TYPES;

export function vdiLeadTypeLabel(tip: string | null): string {
  return tip && tip in VDI_LEAD_TYPES ? VDI_LEAD_TYPES[tip as VdiLeadType] : "Lead";
}

/** `X-VDI-Semnatura` = `sha256=` + HMAC-SHA256 hex pe corpul brut; comparare în timp constant. */
export function verifyVdiSignature(rawBody: string, header: string | null, secret: string | null): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`);
  const got = Buffer.from(header.trim());
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function signVdiBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

/** Doar `agentie_id`, citit înainte de verificare ca să alegem secretul agenției. */
export function readVdiAgencyId(rawBody: string): string | null {
  try {
    const v = (JSON.parse(rawBody) as { agentie_id?: unknown }).agentie_id;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "string" && /^\d{1,20}$/.test(v.trim())) return v.trim();
  } catch {
    /* corp invalid */
  }
  return null;
}

export type VdiLead = {
  id: string;
  tip: string | null;
  typeLabel: string;
  sentAt: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  offerIdintern: string | null;
  offerTitle: string | null;
  offerLink: string | null;
  agentIdintern: string | null;
  amount: number | null;
  currency: string | null;
};

const str = (v: unknown, max = 500): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function parseVdiLead(raw: unknown): VdiLead | null {
  const l = obj(raw);
  const id = l ? str(l["id"], 120) : null;
  if (!l || !id) return null;
  const oferta = obj(l["oferta"]);
  const agent = obj(l["agent"]);
  const date = str(l["data"], 60);
  const parsedDate = date ? Date.parse(date) : NaN;
  const amount = typeof l["suma"] === "number" ? l["suma"] : Number(str(l["suma"]) ?? NaN);
  const tip = str(l["tip"], 40);
  return {
    id,
    tip,
    typeLabel: vdiLeadTypeLabel(tip),
    sentAt: Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : new Date().toISOString(),
    name: str(l["nume"], 200),
    phone: str(l["telefon"], 40),
    email: str(l["email"], 200)?.toLowerCase() ?? null,
    message: str(l["mesaj"], 4000),
    offerIdintern: oferta ? str(oferta["idintern"], 40) : null,
    offerTitle: oferta ? str(oferta["titlu"], 300) : null,
    offerLink: oferta ? str(oferta["link"], 500) : null,
    agentIdintern: agent ? str(agent["idintern"], 40) : null,
    amount: Number.isFinite(amount) ? amount : null,
    currency: str(l["moneda"], 10),
  };
}

/** Webhook: `{"eveniment":"lead_nou","agentie_id":…,"lead":{…}}`. */
export function parseVdiWebhook(rawBody: string): { event: string | null; lead: VdiLead | null; raw: unknown } {
  try {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    return { event: str(body["eveniment"], 40), lead: parseVdiLead(body["lead"]), raw: body };
  } catch {
    return { event: null, lead: null, raw: null };
  }
}

export function vdiLeadNote(l: VdiLead): string {
  const lines = [`VDI.ro — ${l.typeLabel}`];
  if (l.tip === "oferta_pret" && l.amount !== null) lines.push(`Sumă oferită: ${l.amount} ${l.currency ?? ""}`.trim());
  if (l.offerTitle) lines.push(`Anunț: ${l.offerTitle}${l.offerIdintern ? ` (HB-${l.offerIdintern})` : ""}`);
  if (l.message) lines.push(l.message);
  return lines.join("\n");
}

export type VdiListingMatch = { propertyId: string; assignedTo: string | null; title: string | null };

export type VdiLeadDeps = {
  /** `portal_listings.external_id` = `idintern`, DOAR în agenția dată. */
  findListing: (organizationId: string, idintern: string) => Promise<VdiListingMatch | null>;
  /** `portal_agent_links.external_id` → utilizator, DOAR în agenția dată. */
  findAgent: (organizationId: string, idintern: string) => Promise<string | null>;
  saveUnmatched: (lead: VdiLead, eventId: string | null) => Promise<void>;
  ingest: (input: {
    organizationId: string;
    propertyId: string | null;
    assignedTo: string | null;
    propertyTitle: string | null;
    lead: VdiLead;
  }) => Promise<{ leadId: string; created: boolean }>;
  notify: (input: {
    organizationId: string;
    assignedTo: string | null;
    leadId: string;
    created: boolean;
    lead: VdiLead;
    propertyTitle: string | null;
  }) => Promise<void>;
};

export type VdiLeadOutcome =
  | { status: "lead"; leadId: string; created: boolean }
  | { status: "unmatched" }
  | { status: "invalid" };

/**
 * Lead → anunț prin `oferta.idintern`; anunț menționat dar negăsit → nepotrivit
 * (fără ghicirea agenției). Fără anunț (formular agenție) → lead pe agenția
 * verificată prin semnătură / cheie, fără proprietate.
 */
export async function processVdiLead(
  deps: VdiLeadDeps,
  organizationId: string,
  lead: VdiLead | null,
  eventId: string | null,
): Promise<VdiLeadOutcome> {
  if (!lead) return { status: "invalid" };
  let listing: VdiListingMatch | null = null;
  if (lead.offerIdintern) {
    listing = await deps.findListing(organizationId, lead.offerIdintern);
    if (!listing) {
      await deps.saveUnmatched(lead, eventId);
      return { status: "unmatched" };
    }
  }
  const agent = lead.agentIdintern ? await deps.findAgent(organizationId, lead.agentIdintern) : null;
  const assignedTo = agent ?? listing?.assignedTo ?? null;
  const result = await deps.ingest({
    organizationId,
    propertyId: listing?.propertyId ?? null,
    assignedTo,
    propertyTitle: listing?.title ?? lead.offerTitle,
    lead,
  });
  await deps.notify({
    organizationId,
    assignedTo,
    leadId: result.leadId,
    created: result.created,
    lead,
    propertyTitle: listing?.title ?? lead.offerTitle,
  });
  return { status: "lead", ...result };
}

/** Limitele contului (de probă: 30/min; plin: 60/min). Folosim limita mai strictă. */
export const VDI_API_RATE_LIMIT = { limit: 30, windowSeconds: 60 } as const;
export const VDI_LEADS_PAGE_LIMIT = 100;
export const VDI_MAX_ATTEMPTS = 5;
/** Pauze între reîncercări (după 1, 5, 15, 60 de minute). */
export const VDI_RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000] as const;
