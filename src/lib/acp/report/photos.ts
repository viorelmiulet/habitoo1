import { redactListingText } from "@/lib/acp/enrichment";
/** Ajutoare pure pentru pozele și descrierile din raportul ACP. */

/** Până la 3 URL-uri https de poze ale unei oferte de piață (pentru raport). */
export function marketListingPhotoUrls(row: { images?: unknown; image_url?: string | null }): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && /^https:\/\//i.test(value) && !urls.includes(value)) urls.push(value);
  };
  if (Array.isArray(row.images)) for (const v of row.images) push(v);
  push(row.image_url);
  return urls.slice(0, 3);
}

/** Fragment de descriere pentru raport, fără telefoane sau emailuri. */
export function reportDescriptionExcerpt(value: string | null | undefined, max = 420): string | null {
  if (!value) return null;
  const clean = value
    .replace(/<[^>]+>/g, " ")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "")
    .replace(/(\+?4?0|0)[\s.-]?\d{2,3}([\s.-]?\d{3}){2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max).replace(/\s+\S*$/, "")}…` : clean;
}


/** Fragment (~600 caractere) din descrierea unei oferte de piață, redactat pentru snapshot. */
export function marketReportDescription(value: string | null | undefined): string | null {
  return reportDescriptionExcerpt(redactListingText(value), 600);
}
