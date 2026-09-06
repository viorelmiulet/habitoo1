/**
 * Registru generic de portaluri imobiliare.
 * Modelul este agnostic: fiecare portal are o cheie stabilă, iar starea de
 * configurare/publicare trăiește în `portal_integrations` / `portal_publications`.
 * Nu presupunem nimic despre un portal anume în restul aplicației.
 */

export type PortalKey = string;

export type PortalIntegrationStatus = "not_configured" | "ready" | "active" | "error";

export type PortalDefinition = {
  key: PortalKey;
  name: string;
  /** Cum consumă portalul datele: `feed_pull` = citește feedul nostru. */
  mode: "feed_pull" | "webhook_push";
  website: string;
  /** Ce trebuie completat de agenție pentru a marca integrarea „pregătită”. */
  requires: { externalAgencyId: boolean; credential: boolean };
  description: string;
  /** Documentația externă pe care se bazează integrarea. */
  docs?: string;
};

export const PORTALS: PortalDefinition[] = [
  {
    key: "clickimob",
    name: "ClickImob",
    // ClickImob preia oferta din feedul CRM-ului și notifică prin webhook CRM→portal.
    mode: "webhook_push",
    website: "https://www.clickimob.ro",
    requires: { externalAgencyId: true, credential: true },
    description:
      "ClickImob citește ofertele din feedul Habitoo și primește notificări la modificarea unei oferte.",
    docs: "https://www.clickimob.ro",
  },
];

export function getPortalDefinition(key: string): PortalDefinition | null {
  return PORTALS.find((p) => p.key === key) ?? null;
}

/**
 * Starea derivată din configurarea existentă. Nu marchează niciodată „active”
 * doar pentru că datele există: activarea rămâne o decizie explicită.
 */
export function derivePortalStatus(input: {
  definition: PortalDefinition;
  externalAgencyId: string | null;
  hasCredential: boolean;
  enabled: boolean;
  lastError: string | null;
}): PortalIntegrationStatus {
  const complete =
    (!input.definition.requires.externalAgencyId || Boolean(input.externalAgencyId)) &&
    (!input.definition.requires.credential || input.hasCredential);
  if (!complete) return "not_configured";
  if (input.lastError) return "error";
  return input.enabled ? "active" : "ready";
}
