/**
 * Regula de emitere a cheilor Habitoo pe portal. Properstar nu mai are chei pe
 * agenție (feedul se distribuie doar prin indexul protejat), iar portalurile
 * care își emit singure cheia (ex. iMove) nu primesc chei de la Habitoo.
 */
import type { PortalDefinition } from "./registry";

export function assertPortalKeyAllowed(
  definition: Pick<PortalDefinition, "id" | "display_name" | "authentication">,
): void {
  if (definition.id === "properstar") {
    throw new Error(
      "Properstar nu folosește chei pe agenție. Agenția intră automat în feed după activarea portalului.",
    );
  }
  if (definition.id === "clickimob") {
    throw new Error(
      "ClickImob nu folosește chei pe agenție. Agenția intră automat în indexul ClickImob după activarea portalului.",
    );
  }
  if (!definition.authentication.includes("habitoo_api_key")) {
    throw new Error(
      `${definition.display_name} folosește o cheie API emisă de portal. Salvează cheia primită de la ei în configurarea integrării.`,
    );
  }
}
