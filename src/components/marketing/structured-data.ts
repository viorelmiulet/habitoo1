import { PLAN_AGENT_LIMITS, PLAN_LABELS, PLAN_PRICES, type PlanKey } from "@/lib/plans";
import { SITE_NAME, SITE_URL, LEGAL_NAME, COMPANY_TAX_ID, COMPANY_REGISTER_ID, FACEBOOK_URL, GOOGLE_PROFILE_URL } from "./public-identity";
export { FACEBOOK_URL, GOOGLE_PROFILE_URL } from "./public-identity";

/** Identități comune; definite complet doar pe pagina principală. */
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SOFTWARE_ID = `${SITE_URL}/#software`;
export const SERVICE_ID = `${SITE_URL}/#service`;
export const CONTACT_EMAIL = "contact@habitoo.ro";
export const CONTACT_PHONE = "+40767941512";
export const CONTACT_PHONE_DISPLAY = "0767 941 512";
export const WHATSAPP_URL = "https://wa.me/40767941512";

const CTX = "https://schema.org";
type Ld = Record<string, unknown>;

export function homeIdentityJsonLd(description: string): Ld[] {
  return [
    {
      "@context": CTX,
      "@type": "Organization",
      "@id": ORG_ID,
      name: SITE_NAME,
      legalName: LEGAL_NAME,
      taxID: COMPANY_TAX_ID,
      identifier: { "@type": "PropertyValue", propertyID: "Registrul Comerțului", value: COMPANY_REGISTER_ID },
      address: { "@type": "PostalAddress", addressLocality: "Dudu, comuna Chiajna", addressRegion: "Ilfov", addressCountry: "RO" },
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/assets/habitoo-logo.png`,
      sameAs: [FACEBOOK_URL, GOOGLE_PROFILE_URL],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACT_EMAIL,
        telephone: CONTACT_PHONE,
        availableLanguage: "ro",
      },
    },
    {
      "@context": CTX,
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      inLanguage: "ro",
      publisher: { "@id": ORG_ID },
      offers: planOffersJsonLd().offers,
    },
    {
      "@context": CTX,
      "@type": "Service",
      "@id": SERVICE_ID,
      name: "CRM imobiliar pentru agenții imobiliare",
      provider: { "@id": ORG_ID },
      serviceType: "CRM imobiliar",
      areaServed: { "@type": "Country", name: "România" },
      audience: { "@type": "Audience", audienceType: "agenții și agenți imobiliari" },
      knowsAbout: ["CRM imobiliar", "publicare pe portaluri imobiliare", "anunțuri de la proprietari", "analiză comparativă de piață", "colaborare între agenții", "comisioane agenți"],
      isRelatedTo: { "@id": SOFTWARE_ID },
    },
    {
      "@context": CTX,
      "@type": "SoftwareApplication",
      "@id": SOFTWARE_ID,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "ro",
      description,
      publisher: { "@id": ORG_ID },
    },
  ];
}

/** Merge repeated identities while preserving each page's own schema nodes. */
export function publicGraphJsonLd(pageNodes?: Ld | Ld[]): Ld {
  const nodes = homeIdentityJsonLd("CRM imobiliar pentru agențiile și agenții imobiliari din România.");
  for (const node of pageNodes ? (Array.isArray(pageNodes) ? pageNodes : [pageNodes]) : []) {
    const existing = node["@id"] ? nodes.findIndex((item) => item["@id"] === node["@id"]) : -1;
    if (existing >= 0) nodes[existing] = { ...nodes[existing], ...node };
    else nodes.push(node);
  }
  return { "@context": CTX, "@graph": nodes.map(({ "@context": _context, ...node }) => node) };
}

export const PLAN_ORDER: PlanKey[] = ["basic", "pro", "unlimited"];

function planDescription(key: PlanKey): string {
  const limit = PLAN_AGENT_LIMITS[key];
  return `Planul ${PLAN_LABELS[key]} Habitoo CRM, ${
    limit === null ? "fără limită de agenți" : `până la ${limit} agenți`
  }, facturat lunar.`;
}

/** Ofertele din aceeași sursă (PLAN_PRICES) ca tabelul de prețuri. */
export function planOffersJsonLd(): Ld {
  return {
    "@context": CTX,
    "@id": SOFTWARE_ID,
    "@type": "SoftwareApplication",
    offers: PLAN_ORDER.map((key) => ({
      "@type": "Offer",
      name: PLAN_LABELS[key],
      price: PLAN_PRICES[key].monthly,
      priceCurrency: "EUR",
      url: `${SITE_URL}/preturi`,
      description: planDescription(key),
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: PLAN_PRICES[key].monthly,
        priceCurrency: "EUR",
        unitText: "MONTH",
      },
    })),
  };
}

export function breadcrumbJsonLd(path: string, name: string): Ld {
  return {
    "@context": CTX,
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Acasă", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
}

type PageType = "WebPage" | "AboutPage" | "ContactPage";

/** Pagină + breadcrumb, legate de identitatea comună prin @id. */
export function pageJsonLd(opts: {
  path: string;
  name: string;
  description: string;
  type?: PageType;
  about?: "software" | "organization";
}): Ld[] {
  const url = `${SITE_URL}${opts.path}`;
  return [
    {
      "@context": CTX,
      "@type": opts.type ?? "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: opts.name,
      description: opts.description,
      inLanguage: "ro",
      isPartOf: { "@id": WEBSITE_ID },
      about: { "@id": opts.about === "organization" ? ORG_ID : SOFTWARE_ID },
    },
    breadcrumbJsonLd(opts.path, opts.name),
  ];
}
