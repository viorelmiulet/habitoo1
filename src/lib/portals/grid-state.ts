/**
 * Starea afișată pe cardul unui portal din grila Superadmin → Portaluri.
 *
 * Combină două surse, în ordinea importantei pentru administrator:
 *  1. starea conexiunii derivată (`derivePortalConnectionStatus`);
 *  2. ultima cerere de activare trimisă de agenție (din `portal_activation_requests`).
 *
 * Pură și partajată: UI-ul doar o afișează, testele o verifică direct.
 */
import type { PortalConnectionStatus } from "./registry";

export type PortalGridTone = "success" | "warning" | "danger" | "muted";

export type PortalGridState = {
  key: "connected" | "ready" | "pending_request" | "rejected_request" | "inactive" | "error";
  label: string;
  tone: PortalGridTone;
};

/** Cererea de activare a agenției, ca stare simplă. */
export type PortalRequestStatus = "pending" | "approved" | "rejected";

export function portalGridState(input: {
  connectionStatus: PortalConnectionStatus;
  /** Ultima cerere de activare a agenției pentru portal, dacă există. */
  requestStatus?: PortalRequestStatus | null;
}): PortalGridState {
  if (input.connectionStatus === "connected") {
    return { key: "connected", label: "Conectat", tone: "success" };
  }
  if (input.requestStatus === "pending") {
    return { key: "pending_request", label: "Cerere de activare în așteptare", tone: "warning" };
  }
  if (input.requestStatus === "rejected") {
    return { key: "rejected_request", label: "Cerere respinsă", tone: "danger" };
  }
  if (input.connectionStatus === "ready") {
    return { key: "ready", label: "Pregătit pentru conectare", tone: "warning" };
  }
  if (input.connectionStatus === "error") {
    return { key: "error", label: "Eroare de conexiune", tone: "danger" };
  }
  return { key: "inactive", label: "Neactivat", tone: "muted" };
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
  const base = portalGridState({
    connectionStatus: input.activated ? "connected" : "disconnected",
    requestStatus: input.request?.status ?? null,
  });
  if (base.key === "connected") return { key: "connected", label: "Conectat", tone: "success" };
  if (base.key === "pending_request" && input.request) {
    return { key: "pending", buttonLabel: "Cerere trimisă", disabled: true, requestedAt: input.request.requestedAt };
  }
  if (base.key === "rejected_request") {
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
