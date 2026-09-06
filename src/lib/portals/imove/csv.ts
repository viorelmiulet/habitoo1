/**
 * Serializator CSV Habitoo → iMove.ro.
 *
 * Structura respectă STRICT formatul oficial de exemplu iMove:
 *  - prima linie = headerul exact, în ordinea documentată;
 *  - encoding UTF-8, separator virgulă, terminator de linie CRLF (RFC 4180);
 *  - valorile text sunt încadrate în ghilimele când conțin virgulă, ghilimele
 *    sau newline, iar ghilimelele interne se dublează;
 *  - `imageUrls` = un singur câmp, URL-uri publice HTTPS separate prin `;`,
 *    maximum 40 imagini;
 *  - câmpurile numerice sunt trimise ca numere, fără ghilimele;
 *  - câmpurile numerice inexistente rămân goale (nu inventăm valori).
 *
 * CSV-ul și JSON-ul folosesc EXACT aceeași selecție și aceeași mapare
 * (`mapPropertyToImove`); diferă doar serializarea.
 */
import { IMOVE_MAX_IMAGES, type ImoveListing } from "./mapper";

/** Headerul oficial iMove, în ordine exactă. */
export const IMOVE_CSV_HEADER = [
  "externalId",
  "title",
  "description",
  "price",
  "currency",
  "transactionType",
  "propertyType",
  "city",
  "district",
  "addressPublic",
  "rooms",
  "bathrooms",
  "usableArea",
  "floor",
  "totalFloors",
  "constructionYear",
  "agentPhone",
  "agentEmail",
  "imageUrls",
] as const;

export const IMOVE_CSV_SEPARATOR = ",";
export const IMOVE_CSV_IMAGE_SEPARATOR = ";";
const CRLF = "\r\n";

/** Escapare CSV standard (RFC 4180) pentru valorile text. */
export function imoveCsvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text === "") return "";
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Numerele se trimit ca numere; valorile absente rămân câmp gol. */
function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return String(value);
}

/** Un singur câmp cu URL-urile publice HTTPS separate prin `;`. */
export function imoveCsvImageUrls(urls: string[]): string {
  return urls
    .filter((u) => typeof u === "string" && u.startsWith("https://"))
    .slice(0, IMOVE_MAX_IMAGES)
    .join(IMOVE_CSV_IMAGE_SEPARATOR);
}

/** O linie CSV pentru o ofertă mapată. */
export function imoveCsvRow(listing: ImoveListing): string {
  const cells = [
    imoveCsvEscape(listing.externalId),
    imoveCsvEscape(listing.title),
    imoveCsvEscape(listing.description),
    num(listing.price),
    imoveCsvEscape(listing.currency),
    imoveCsvEscape(listing.transactionType),
    imoveCsvEscape(listing.propertyType),
    imoveCsvEscape(listing.citySlug),
    imoveCsvEscape(listing.districtSlug),
    imoveCsvEscape(listing.addressPublic),
    num(listing.rooms),
    num(listing.bathrooms),
    num(listing.usableArea),
    num(listing.floor),
    num(listing.totalFloors),
    num(listing.constructionYear),
    imoveCsvEscape(listing.agentPhone),
    imoveCsvEscape(listing.agentEmail),
    imoveCsvEscape(imoveCsvImageUrls(listing.imageUrls)),
  ];
  return cells.join(IMOVE_CSV_SEPARATOR);
}

/** Documentul CSV complet: header + o linie per ofertă. */
export function imoveCsvDocument(listings: ImoveListing[]): string {
  const lines = [IMOVE_CSV_HEADER.join(IMOVE_CSV_SEPARATOR), ...listings.map(imoveCsvRow)];
  return `${lines.join(CRLF)}${CRLF}`;
}
