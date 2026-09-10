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
  /** Oferta este vizibilă în feedul pe care îl citește portalul. */
  feedVisible?: boolean;
  /** Câte anunțuri a confirmat portalul că a procesat (dacă răspunde cu asta). */
  processed?: number | null;
  /** Mesaj scurt pentru utilizator despre rezultatul real. */
  message?: string;
  /**
   * Starea reală raportată de portal, când operațiunea este asincronă
   * (`pending` = acceptat, dar încă nepublicat). Suprascrie starea deduse din
   * acțiune, ca să nu marcăm „publicat” un anunț aflat în validare.
   */
  portalStatus?: string | null;
};

export type ConnectionStatusOutcome = {
  configured: boolean;
  live: boolean;
  detail: string;
  /** Diagnoză reală a feedului pe care îl consumă portalul. */
  feed?: {
    ok: boolean;
    apiVersion: string | null;
    /** Oferte eligibile expuse portalului. */
    properties: number | null;
    /** Agenți expuși portalului. */
    agents: number | null;
    /** Chei active emise de Habitoo pentru portal. */
    activeKeys: number | null;
    url: string;
  };
};

/** Diagnoza feedului, imaginilor și agenților pentru o ofertă anume. */
export type ListingDiagnostics = {
  feedVisible: boolean;
  externalId: string | null;
  offerUrl: string | null;
  agentId: string | null;
  agentName: string | null;
  images: { total: number; resolvable: number; broken: number; primary: boolean };
  updatedAt: string | null;
  notes: string[];
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
  /** Diagnoză feed + imagini + agent pentru o ofertă. */
  diagnoseListing?(ctx: PortalContext, ref: ListingRef): Promise<PortalResult<ListingDiagnostics>>;
  publishBulk?(ctx: PortalContext, refs: ListingRef[]): Promise<PortalResult<{ processed: number }>>;
  webhookSend?(ctx: PortalContext, ref: ListingRef): Promise<PortalResult<ListingOutcome>>;
  webhookReceive?(ctx: PortalContext, payload: unknown): Promise<PortalResult<{ handled: boolean }>>;
}
