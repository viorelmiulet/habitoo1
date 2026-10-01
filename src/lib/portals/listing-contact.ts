/**
 * Regula unică pentru contactul unui anunț pe portaluri: agentul responsabil
 * al proprietății (`properties.assigned_to`). Niciodată agenția sau adminul,
 * fără trecere pe `organizations.phone` / `material_phone`.
 */
import { normalizeRoMobile } from "@/lib/user-profile";

export type ListingContactAgent = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url?: string | null;
} | null;

export type ListingContact = {
  name: string;
  phone: string;
  email: string | null;
  photoUrl: string | null;
};

export type ListingContactResult =
  | { ok: true; contact: ListingContact }
  | { ok: false; code: "NO_AGENT" | "NO_PHONE"; message: string };

export const NO_AGENT_MESSAGE = "Anunțul nu are agent responsabil.";
export const FEED_EXCLUDED_NO_PHONE = "Exclus din feed: agentul nu are telefon.";

export function noPhoneMessage(name: string | null | undefined): string {
  const label = (name ?? "").trim() || "responsabil";
  return `Agentul ${label} nu are telefon în profil. Completează-l în Echipă / Profil.`;
}

export function resolveListingContact(property: {
  assignedTo: string | null | undefined;
  agent: ListingContactAgent | undefined;
}): ListingContactResult {
  const agent = property.agent ?? null;
  if (!property.assignedTo || !agent) {
    return { ok: false, code: "NO_AGENT", message: NO_AGENT_MESSAGE };
  }
  const name = (agent.full_name ?? "").trim();
  const phone = normalizeRoMobile(agent.phone);
  if (!phone) return { ok: false, code: "NO_PHONE", message: noPhoneMessage(name) };
  const email = (agent.email ?? "").trim() || null;
  return {
    ok: true,
    contact: { name, phone: (agent.phone ?? "").trim(), email, photoUrl: agent.avatar_url ?? null },
  };
}

/** Portalurile de tip feed din care se exclud ofertele al căror agent nu are telefon. */
export const FEED_PORTALS_REQUIRING_AGENT_PHONE = new Set(["clickimob", "imove"]);

/** Filtrează ofertele: rămân doar cele cu agent responsabil care are telefon valid. */
export function idsWithAgentPhone(
  properties: { id: string; assigned_to: string | null }[],
  agents: { id: string; full_name: string | null; email: string | null; phone: string | null }[],
): string[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  return properties
    .filter(
      (p) =>
        resolveListingContact({
          assignedTo: p.assigned_to,
          agent: p.assigned_to ? (byId.get(p.assigned_to) ?? null) : null,
        }).ok,
    )
    .map((p) => p.id);
}
