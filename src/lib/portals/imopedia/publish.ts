/**
 * Imopedia.ro — reguli pure pentru publicare (fără rețea, fără DB):
 * ID_LOCAL, link public, plicuri saveAgent/saveProperty/deleteProperty,
 * citirea rezultatului saveProperty și motivele blocante.
 */
import { buildOptionsEnvelope, type SoapField } from "./soap";
import { mapPropertyToImopedia, type ImopediaMapContext } from "./mapper";

export const IMOPEDIA_MAX_INT = 2_147_483_647;

/** `HB-1009` → 1009 (cifrele referinței, ca `idintern` la VDI.ro); null dacă lipsesc sau depășesc xsd:int. */
export function imopediaIdLocal(reference: string | null | undefined): number | null {
  const digits = (reference ?? "").match(/\d+/g)?.join("") ?? "";
  if (!digits) return null;
  const value = Number(digits.replace(/^0+(?=\d)/, ""));
  return Number.isSafeInteger(value) && value > 0 && value <= IMOPEDIA_MAX_INT ? value : null;
}

/** Formula documentată de Imopedia (docs.imopedia.ro/concepts). */
export function imopediaPublicUrl(agencyId: number, idLocal: number): string {
  return `https://www.imopedia.ro/anunt/proprietate-${agencyId}RUN${idLocal}`;
}

export type ImopediaAgent = { userId: string; fullName: string | null; email: string | null; phone: string | null };

export const IMOPEDIA_NO_PHONE = "Agentul responsabil nu are telefon; Imopedia îl afișează ca date de contact.";
export const IMOPEDIA_NO_AGENT = "Proprietatea nu are agent responsabil; Imopedia afișează agentul ca date de contact.";
export const IMOPEDIA_NO_ID_LOCAL =
  "Codul proprietății nu are o parte numerică validă (max. 2147483647); Imopedia identifică oferta prin acest număr (ID_LOCAL).";
export const IMOPEDIA_SERVER_REJECTION =
  "Imopedia a respins oferta fără detalii (verifică agentul, prețul, moneda, regiunea și valorile numerice).";

export function agentFields(agencyId: number, agentId: number, agent: ImopediaAgent): SoapField[] {
  return [
    { name: "AGENTIA", type: "xsd:int", value: agencyId },
    { name: "AGENT_ID", type: "xsd:int", value: agentId },
    { name: "CONTACT_PERS", type: "xsd:string", value: (agent.fullName ?? "").trim() || null },
    { name: "CONTACT_TEL", type: "xsd:string", value: (agent.phone ?? "").trim() || null },
    { name: "CONTACT_EMAIL", type: "xsd:string", value: (agent.email ?? "").trim() || null },
  ];
}

/** Amprenta datelor de contact trimise (cont + nume + telefon + email). */
export function imopediaAgentFingerprint(agencyId: number, agent: ImopediaAgent): string {
  const s = JSON.stringify([agencyId, (agent.fullName ?? "").trim(), (agent.phone ?? "").trim(), (agent.email ?? "").trim().toLowerCase()]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `ip1:${h.toString(16)}:${s.length}`;
}

export function buildSaveAgentEnvelope(sessionId: string, fields: SoapField[]): string {
  return buildOptionsEnvelope("saveAgent", sessionId, "SaveAgentType", fields);
}

/** Câmpurile mapperului + ID_LOCAL + AGENT_ID (AGENTIA și GOLD=0 vin din mapper). */
export function savePropertyFields(mapped: SoapField[], idLocal: number, agentId: number): SoapField[] {
  const rest = mapped.filter((f) => f.name !== "ID_LOCAL" && f.name !== "AGENT_ID");
  return [...rest, { name: "ID_LOCAL", type: "xsd:int", value: idLocal }, { name: "AGENT_ID", type: "xsd:int", value: agentId }];
}

export function buildSavePropertyEnvelope(sessionId: string, fields: SoapField[]): string {
  return buildOptionsEnvelope("saveProperty", sessionId, "SavePropertyType", fields);
}

export function buildDeletePropertyEnvelope(sessionId: string, agencyId: number, idLocal: number): string {
  return buildOptionsEnvelope("deleteProperty", sessionId, "DeletePropertyType", [
    { name: "ID_LOCAL", type: "xsd:int", value: idLocal },
    { name: "AGENTIA", type: "xsd:int", value: agencyId },
  ]);
}

const first = (v: unknown): unknown => {
  if (Array.isArray(v)) return v[0];
  if (v && typeof v === "object") return (v as Record<string, unknown>)["0"];
  return undefined;
};

/** Din `_success[0].result` (listă sau obiect cu cheia "0"): ID_LOCAL și property_id. */
export function readSavePropertySuccess(raw: Record<string, unknown>): { idLocal: number | null; propertyId: string | null } {
  const entry = first(raw["_success"]);
  const result = entry && typeof entry === "object" ? (entry as Record<string, unknown>)["result"] : undefined;
  let item = first(result);
  if ((!item || typeof item !== "object") && result && typeof result === "object" && "ID_LOCAL" in (result as object)) item = result;
  const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const idRaw = rec["ID_LOCAL"];
  const idLocal = idRaw === undefined || idRaw === null || idRaw === "" ? null : Number(idRaw);
  const pid = rec["property_id"];
  return {
    idLocal: idLocal !== null && Number.isFinite(idLocal) ? idLocal : null,
    propertyId: pid === undefined || pid === null || pid === "" ? null : String(pid),
  };
}

export function isExpiredSession(errors: string[]): boolean {
  return errors.some((e) => /invalid or expired session/i.test(e));
}

/** Mesajul afișat pentru `_isValid=false`. */
export function imopediaRejectionMessage(errors: string[]): string {
  if (errors.length === 0 || errors.every((e) => /internal server error/i.test(e))) return IMOPEDIA_SERVER_REJECTION;
  return `Imopedia.ro: ${errors.join("; ")}`;
}

export type ImopediaBlockingInput = {
  row: Parameters<typeof mapPropertyToImopedia>[0] & { reference?: string | null };
  ctx: ImopediaMapContext;
  agent: ImopediaAgent | null;
  externalId?: string | null;
  /** Imagini publicabile; verificat doar când e cunoscut. */
  imageCount?: number;
};

export const IMOPEDIA_NO_IMAGE = "Adaugă cel puțin o fotografie publicabilă: Imopedia nu afișează oferte fără imagini.";

/** Toate motivele blocante, în ordinea afișată în Publicare. */
export function imopediaBlockingReasons(input: ImopediaBlockingInput): string[] {
  const mapped = mapPropertyToImopedia(input.row, input.ctx);
  const reasons = mapped.ok ? [] : [...mapped.reasons];
  const idLocal = input.externalId ? imopediaIdLocal(input.externalId) : imopediaIdLocal(input.row.reference);
  if (idLocal === null) reasons.push(IMOPEDIA_NO_ID_LOCAL);
  if (input.imageCount !== undefined && input.imageCount < 1) reasons.push(IMOPEDIA_NO_IMAGE);
  if (!input.agent) reasons.push(IMOPEDIA_NO_AGENT);
  else if (!(input.agent.phone ?? "").trim()) reasons.push(IMOPEDIA_NO_PHONE);
  return reasons;
}
