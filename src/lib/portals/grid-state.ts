/**
 * Starea afișată pe cardul unui portal din grila Superadmin → Portaluri.
 *
 * Combină două surse, în ordinea importantei pentru administrator:
 *  starea conexiunii derivată (`derivePortalConnectionStatus`). Cererile de
 *  activare se văd separat, în cardul de cereri.
 *
 * Pură și partajată: UI-ul doar o afișează, testele o verifică direct.
 */
import { PORTAL_CONNECTION_LABEL, type PortalConnectionStatus } from "./registry";

export type PortalGridTone = "success" | "danger" | "muted";

export type PortalGridState = {
  key: PortalConnectionStatus;
  label: string;
  tone: PortalGridTone;
};

/** Cererea de activare a agenției, ca stare simplă. */
export type PortalRequestStatus = "pending" | "approved" | "rejected";

/** Doar trei stări: Conectat (verde), Eroare (roșu), Deconectat (neutru). */
export function portalGridState(input: {
  connectionStatus: PortalConnectionStatus;
}): PortalGridState {
  const meta = PORTAL_CONNECTION_LABEL[input.connectionStatus];
  return {
    key: input.connectionStatus,
    label: meta.label,
    tone: meta.tone === "neutral" ? "muted" : meta.tone,
  };
}

/** Starea cardului din grila administratorului de agenție (fără configurare). */
export type AgencyPortalCardState =
  | { key: "connected"; label: "Conectat"; tone: "success" }
  | { key: "request"; buttonLabel: "Solicită activarea"; disabled: false }
  | { key: "pending"; buttonLabel: "Cerere trimisă"; disabled: true; requestedAt: string }
  | {
      key: "rejected";
      buttonLabel: "Solicită din nou";
      disabled: false;
      reason: string | null;
    };

export function agencyPortalCardState(input: {
  activated: boolean;
  request: { status: PortalRequestStatus; requestedAt: string; rejectionReason: string | null } | null;
}): AgencyPortalCardState {
  if (input.activated) return { key: "connected", label: "Conectat", tone: "success" };
  if (input.request?.status === "pending") {
    return { key: "pending", buttonLabel: "Cerere trimisă", disabled: true, requestedAt: input.request.requestedAt };
  }
  if (input.request?.status === "rejected") {
    return {
      key: "rejected",
      buttonLabel: "Solicită din nou",
      disabled: false,
      reason: input.request?.rejectionReason ?? null,
    };
  }
  return { key: "request", buttonLabel: "Solicită activarea", disabled: false };
}

/** Doar portalurile integrate, fiecare pereche o singură dată (sursa e deja `configurablePortals()`). */
export function agencyGridItems<T extends { id: string; availability: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (i.availability !== "available" || seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}
