/**
 * Interfața generică a unui adaptor de portal.
 * Operațiile neimplementate NU sunt forțate: adaptorul le omite, iar apelantul
 * primește `NOT_SUPPORTED` prin `notSupported()`.
 */
import type { PortalDefinition, PortalDirection, PortalAuthenticationMode } from "./registry";
import type { PortalErrorCode } from "./errors";
import { PORTAL_ERROR_MESSAGE } from "./errors";

export type PortalOk<T> = { ok: true; data: T };
export type PortalFail = { ok: false; code: PortalErrorCode; message: string; detail?: string | null };
export type PortalResult<T> = PortalOk<T> | PortalFail;

export function notSupported(operation: string): PortalFail {
  return {
    ok: false,
    code: "NOT_SUPPORTED",
    message: PORTAL_ERROR_MESSAGE.NOT_SUPPORTED,
    detail: `operation=${operation}`,
  };
}

/** Contextul unei operații: credențialul decriptat rămâne strict server-side. */
export type PortalContext = {
  organizationId: string;
  definition: PortalDefinition;
  direction: PortalDirection;
  authenticationMode: PortalAuthenticationMode;
  externalAccountId: string | null;
  /** Credențialul portalului, decriptat. Nu se loghează și nu se returnează. */
  portalCredential: string | null;
  settings: Record<string, unknown>;
  /**
   * Când este `false`, adaptorul validează totul local și raportează ce ar fi
   * trimis, fără niciun request extern (dry-run).
   */
  allowLiveRequests: boolean;
};

export type ListingRef = { propertyId: string; externalId: string | null };

export type ListingOutcome = {
  externalId: string | null;
  /** `true` dacă operația a ajuns efectiv la portal. */
  live: boolean;
  /** Descriere sanitizată a ce s-a trimis (fără secrete). */
  detail: string;
};

export type ConnectionStatusOutcome = {
  configured: boolean;
  live: boolean;
  detail: string;
};

export interface PortalAdapter {
  readonly id: string;
  testConnection(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>>;
  getStatus(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>>;
  publishListing(ctx: PortalContext, ref: ListingRef): Promise<PortalResult<ListingOutcome>>;
  updateListing(ctx: PortalContext, ref: ListingRef): Promise<PortalResult<ListingOutcome>>;
  withdrawListing(ctx: PortalContext, ref: ListingRef): Promise<PortalResult<ListingOutcome>>;
  sync(ctx: PortalContext, refs: ListingRef[]): Promise<PortalResult<{ processed: number; failed: number }>>;
  /** Opționale — implementate doar dacă portalul le documentează. */
  fetchListings?(ctx: PortalContext): Promise<PortalResult<unknown[]>>;
  fetchAgents?(ctx: PortalContext): Promise<PortalResult<unknown[]>>;
  publishBulk?(ctx: PortalContext, refs: ListingRef[]): Promise<PortalResult<{ processed: number }>>;
  webhookSend?(ctx: PortalContext, ref: ListingRef): Promise<PortalResult<ListingOutcome>>;
  webhookReceive?(ctx: PortalContext, payload: unknown): Promise<PortalResult<{ handled: boolean }>>;
}
