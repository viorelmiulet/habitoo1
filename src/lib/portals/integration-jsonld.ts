import { SITE_URL } from "@/components/marketing/public-head";
import { WEBSITE_ID, SOFTWARE_ID } from "@/components/marketing/structured-data";
import type { IntegrationPage } from "./integration-pages";

/** WebPage + BreadcrumbList (Acasă › Integrări › Portal) + FAQPage. */
export function integrationJsonLd(page: IntegrationPage): Record<string, unknown>[] {
  const url = `${SITE_URL}/integrari/${page.slug}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      inLanguage: "ro",
      isPartOf: { "@id": WEBSITE_ID },
      about: { "@id": SOFTWARE_ID },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Acasă", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Integrări", item: `${SITE_URL}/integrari` },
        { "@type": "ListItem", position: 3, name: page.name, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];
}
