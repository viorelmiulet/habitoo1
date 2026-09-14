/**
 * Stratul de permisiuni.
 *
 * Modelul poate CERE un tool. Habitoo decide dacă tool-ul se execută:
 * autentificare → apartenență la agenție → capabilitate de rol → tool permis.
 * Nicio decizie de acces nu este delegată modelului.
 */
import type { AiActor, AiRole } from "../gateway/types";

export const AI_CAPABILITIES = [
  "read:properties",
  "read:contacts",
  "read:leads",
  "read:acp",
] as const;

export type AiCapability = (typeof AI_CAPABILITIES)[number];

/** În Stage 11A toate rolurile au doar capabilități de citire. */
const ROLE_CAPABILITIES: Record<AiRole, readonly AiCapability[]> = {
  agent: AI_CAPABILITIES,
  admin: AI_CAPABILITIES,
  superadmin: AI_CAPABILITIES,
};

export function capabilitiesForRole(role: AiRole): readonly AiCapability[] {
  return ROLE_CAPABILITIES[role] ?? [];
}

export type AiToolAuthorization =
  | { allowed: true; capability: AiCapability }
  | {
      allowed: false;
      reason: "unknown_tool" | "missing_organization" | "forbidden";
      message: string;
    };

/**
 * Verifică dacă actorul poate executa tool-ul cerut.
 * `capabilityOf` vine din registry, ca permisiunile să nu depindă de model.
 */
export function authorizeAiTool(
  actor: Partial<AiActor> | null | undefined,
  toolName: string,
  capabilityOf: (name: string) => AiCapability | null,
): AiToolAuthorization {
  const capability = capabilityOf(toolName);
  if (!capability) {
    return {
      allowed: false,
      reason: "unknown_tool",
      message: "Instrumentul cerut nu există.",
    };
  }
  if (!actor?.userId) {
    return {
      allowed: false,
      reason: "forbidden",
      message: "Sesiune invalidă.",
    };
  }
  if (!actor.organizationId) {
    return {
      allowed: false,
      reason: "missing_organization",
      message: "Habitoo AI este disponibil doar utilizatorilor unei agenții.",
    };
  }
  if (!capabilitiesForRole(actor.role ?? "agent").includes(capability)) {
    return {
      allowed: false,
      reason: "forbidden",
      message: "Nu ai permisiunea necesară pentru această informație.",
    };
  }
  return { allowed: true, capability };
}
