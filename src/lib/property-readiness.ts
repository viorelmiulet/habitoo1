/**
 * Diagnostic de „pregătire pentru publicare” al unei proprietăți.
 *
 * Regulile reutilizează exact pragurile din adaptoarele de portal
 * (`IMOSPOT_MIN_DESCRIPTION`, `HOMEPITCH_RECOMMENDED_DESCRIPTION`) și cerința
 * HomePitch de coordonate reale, ca dashboardurile să semnaleze aceleași
 * probleme pe care le-ar refuza publicarea propriu-zisă.
 */
import { IMOSPOT_MIN_DESCRIPTION } from "@/lib/portals/imospot/mapper";
import { HOMEPITCH_RECOMMENDED_DESCRIPTION } from "@/lib/portals/homepitch/mapper";

/** Minim de fotografii sub care oferta nu are șanse pe portaluri. */
export const MIN_PUBLISH_IMAGES = 3;
/** Zile după care o ofertă nepublicată devine o problemă. */
export const UNPUBLISHED_GRACE_DAYS = 7;
/** Zile fără activitate după care o ofertă e considerată „uitată”. */
export const STALE_PROPERTY_DAYS = 30;

export type PropertyIssueCode =
  | "no_images"
  | "few_images"
  | "no_description"
  | "short_description"
  | "weak_description"
  | "no_price"
  | "no_coords"
  | "no_location"
  | "portal_error"
  | "portal_withdrawn"
  | "unpublished";

export type PropertyIssue = {
  code: PropertyIssueCode;
  label: string;
  severity: "danger" | "warning";
};

export type ReadinessInput = {
  description: string | null;
  imageCount: number;
  lat: number | null;
  lng: number | null;
  price: number | null;
  salePrice: number | null;
  rentPrice: number | null;
  city: string | null;
  address: string | null;
  publishStatus: string | null;
  createdAt: string;
  /** Publicări portal active pe această proprietate. */
  publications: { portalKey: string; status: string | null; enabled: boolean }[];
};

/** Problemele care blochează sau slăbesc publicarea, în ordinea gravității. */
export function computePropertyIssues(input: ReadinessInput): PropertyIssue[] {
  const issues: PropertyIssue[] = [];

  if (input.imageCount === 0) {
    issues.push({ code: "no_images", label: "Fără fotografii", severity: "danger" });
  } else if (input.imageCount < MIN_PUBLISH_IMAGES) {
    issues.push({
      code: "few_images",
      label: `Doar ${input.imageCount} ${input.imageCount === 1 ? "fotografie" : "fotografii"} (minim recomandat ${MIN_PUBLISH_IMAGES})`,
      severity: "warning",
    });
  }

  const description = (input.description ?? "").trim();
  if (!description) {
    issues.push({ code: "no_description", label: "Fără descriere", severity: "danger" });
  } else if (description.length < IMOSPOT_MIN_DESCRIPTION) {
    issues.push({
      code: "short_description",
      label: `Descriere prea scurtă pentru portaluri (${description.length}/${IMOSPOT_MIN_DESCRIPTION} caractere)`,
      severity: "danger",
    });
  } else if (description.length < HOMEPITCH_RECOMMENDED_DESCRIPTION) {
    issues.push({
      code: "weak_description",
      label: `Descriere sub recomandarea portalurilor (${description.length}/${HOMEPITCH_RECOMMENDED_DESCRIPTION} caractere)`,
      severity: "warning",
    });
  }

  const hasPrice = [input.price, input.salePrice, input.rentPrice].some(
    (value) => value !== null && Number(value) > 0,
  );
  if (!hasPrice) {
    issues.push({ code: "no_price", label: "Fără preț valid", severity: "danger" });
  }

  const hasCoords =
    input.lat !== null && input.lng !== null && !(input.lat === 0 && input.lng === 0);
  if (!hasCoords) {
    issues.push({
      code: "no_coords",
      label: "Fără coordonate pe hartă (nu poate fi trimisă către HomePitch)",
      severity: "danger",
    });
  }

  if (!input.city && !input.address) {
    issues.push({ code: "no_location", label: "Fără localitate sau adresă", severity: "danger" });
  }

  for (const pub of input.publications) {
    if (!pub.enabled) continue;
    if (pub.status === "error") {
      issues.push({
        code: "portal_error",
        label: `Eroare de publicare pe ${pub.portalKey}`,
        severity: "danger",
      });
    } else if (pub.status === "disabled" || pub.status === "withdrawn") {
      issues.push({
        code: "portal_withdrawn",
        label: `Retrasă de pe ${pub.portalKey}`,
        severity: "warning",
      });
    }
  }

  const ageDays = (Date.now() - new Date(input.createdAt).getTime()) / 86_400_000;
  if (input.publishStatus !== "published" && ageDays > UNPUBLISHED_GRACE_DAYS) {
    issues.push({
      code: "unpublished",
      label: `Nepublicată de ${Math.floor(ageDays)} zile`,
      severity: "warning",
    });
  }

  return issues;
}

/** O ofertă e „incompletă” dacă are cel puțin o problemă blocantă. */
export function isBlocking(issues: PropertyIssue[]): boolean {
  return issues.some((i) => i.severity === "danger");
}
