import { mediasPath } from "./config";
import { imobiliareMediaImages } from "./media-gallery";
import { parseImobiliareReferences } from "./references";
import { parseImobiliareCredential } from "./auth";
import { decryptPortalCredential } from "../crypto.server";
import { imobiliareRequest } from "./client.server";

/** Read-only evidence for the card, never refresh tokens or write diagnostics. */
export async function readImobiliareMediaStatus(organizationId: string, propertyId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [photos, listing, connection] = await Promise.all([
    db.from("property_images").select("id, include_in_publish, is_confidential, storage_path").eq("organization_id", organizationId).eq("property_id", propertyId),
    db.from("portal_listings").select("external_id, last_error").eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal", "imobiliare_ro").maybeSingle(),
    db.from("portal_connections").select("portal_credentials_encrypted").eq("organization_id", organizationId).eq("portal", "imobiliare_ro").maybeSingle(),
  ]);
  if (photos.error || listing.error || connection.error) throw new Error("Numărul fotografiilor nu a putut fi verificat.");
  const rows = photos.data ?? [];
  const total = rows.length;
  const reasons: string[] = [];
  const confidential = rows.filter(row => row.is_confidential === true).length;
  const excluded = rows.filter(row => row.is_confidential !== true && row.include_in_publish !== true).length;
  const unavailable = rows.filter(row => row.include_in_publish === true && row.is_confidential !== true && !row.storage_path).length;
  if (confidential) reasons.push(`${confidential} poze confidențiale nu se publică.`);
  if (excluded) reasons.push(`${excluded} poze nu sunt selectate pentru publicare.`);
  if (unavailable) reasons.push(`${unavailable} poze nu au fișier disponibil.`);
  const references = parseImobiliareReferences(listing.data?.external_id ?? null);
  if (!references.length) return { sent: 0, total, reasons: [...reasons, "Galeria nu a fost încă trimisă."] };
  const token = parseImobiliareCredential(decryptPortalCredential(connection.data?.portal_credentials_encrypted ?? null));
  if (token?.kind !== "tokens") return { sent: null, total, reasons: [...reasons, "Imobiliare.ro nu a putut confirma pozele: conexiunea nu are token de acces."] };
  let sent: number | null = null;
  for (const reference of references) {
    const response = await imobiliareRequest({ method: "GET", path: mediasPath(reference), accessToken: token.accessToken, connectionKey: organizationId });
    const images = response.ok ? imobiliareMediaImages(response.body) : null;
    if (!images) return { sent: null, total, reasons: [...reasons, `Imobiliare.ro nu a putut confirma galeria (HTTP ${response.status}).`] };
    sent = sent === null ? images.length : Math.min(sent, images.length);
  }
  if ((sent ?? 0) < total - confidential - excluded) {
    reasons.push(listing.data?.last_error ?? "Portalul confirmă mai puține poze decât galeria CRM; galeria completă se retrimite la următoarea publicare/actualizare manuală.");
  }
  return { sent, total, reasons };
}