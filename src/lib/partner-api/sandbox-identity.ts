export const SANDBOX_AGENCY_ID = "a7b50000-0000-4000-8000-000000000001";
export const PARTNER_API_SANDBOX_DELETE_ERROR = "Agenția demo a Partner API nu poate fi ștearsă.";

/** Identitatea fixă a agenției tehnice Partner API, exclusă din agențiile administrate. */
export function isPartnerApiSandboxAgency(id: string | null | undefined): boolean {
  return id === SANDBOX_AGENCY_ID;
}
