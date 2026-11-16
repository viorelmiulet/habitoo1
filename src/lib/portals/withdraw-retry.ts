/**
 * IM8: retragere repetată când selecția e deja oprită local.
 * La Imobiliare.ro, o listare locală `withdrawn` cu `external_id` poate fi încă
 * online pe Imoradar24, așa că retragerea se reapelează (idempotent).
 * Celelalte portaluri sar ca înainte.
 */
export function shouldRewithdrawInactive(input: {
  portalId: string;
  listingStatus: string | null | undefined;
  externalId: string | null | undefined;
  publicationEnabled?: boolean | null;
  publicationMode?: string | null;
}): boolean {
  if (input.portalId !== "imobiliare_ro") return false;
  if (input.listingStatus !== "withdrawn") return false;
  if (!input.externalId) return false;
  if (input.publicationEnabled === true && input.publicationMode === "imoradar_only") return false;
  return true;
}
