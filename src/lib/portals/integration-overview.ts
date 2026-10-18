import { INTEGRATION_PAGES } from "./integration-pages";
import { portalGroupFor, type PortalDefinition } from "./registry";
import { SITE_URL } from "@/components/marketing/public-head";

export const INTEGRATION_SECTIONS = ["Portaluri din România", "Portaluri internaționale", "Reclame"] as const;

const summaries: Record<string, string> = {
  storia: "Publici pe ambele portaluri. Lead-urile intră în CRM.",
  olx_direct: "Publici pe OLX folosind pachetul existent al agenției.",
  romimo: "O singură publicare, anunțul apare pe ambele portaluri.",
  imobiliare_ro: "Anunțurile și agenții tăi ajung împreună pe portal.",
  imospot: "Publici, actualizezi și retragi anunțurile, fără dubluri.",
  vdi: "Publici direct, iar mesajele clienților devin lead-uri.",
  lacheie: "Activezi singur și publici anunțurile direct din Habitoo.",
  oferteimobiliare: "Publici și actualizezi anunțurile fără să le rescrii.",
  primulanunt: "Publici anunțul cu poze și îl retragi dintr-un click.",
  homepitch: "Alegi ofertele, iar portalul le preia automat.",
  imove: "Ofertele și modificările sunt preluate automat din Habitoo.",
  properstar: "Portal internațional, cu lead-uri direct în CRM.",
  clickimob: "Modificările ajung pe portal în cel mult 15 minute.",
  facebook_catalog: "Anunțurile tale, gata pentru reclame pe Facebook și Instagram.",
};

export function integrationBadges(def: PortalDefinition): string[] {
  const feed = def.capabilities.includes("feed_pull");
  const badges: string[] = [];
  if (def.capabilities.includes("publish_listing") && !feed) badges.push("Publicare directă");
  if (feed) badges.push("Preluare automată");
  if (def.capabilities.includes("withdraw_listing") || (feed && def.id !== "facebook_catalog")) badges.push("Retragere automată");
  if (def.receives_leads) badges.push("Lead-uri în CRM");
  if (def.activation === "self_service" || def.activation === "oauth") badges.push("Activezi singur");
  return badges;
}

export const INTEGRATION_OVERVIEW = INTEGRATION_PAGES.map((page) => ({
  id: page.portalId,
  slug: page.slug,
  name: page.portalId === "olx_direct" ? "OLX.ro (pachetul agenției)" : page.name,
  logoIds: [page.portalId, ...(portalGroupFor(page.portalId)?.covers ?? [])],
  summary: summaries[page.portalId] ?? page.intro[0],
  badges: integrationBadges(page.definition),
  section: page.portalId === "properstar" ? INTEGRATION_SECTIONS[1] : page.portalId === "facebook_catalog" ? INTEGRATION_SECTIONS[2] : INTEGRATION_SECTIONS[0],
}));

export function integrationItemListJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Integrări Habitoo CRM",
    numberOfItems: INTEGRATION_OVERVIEW.length,
    itemListElement: INTEGRATION_OVERVIEW.map((item, i) => ({
      "@type": "ListItem", position: i + 1, name: item.name, url: `${SITE_URL}/integrari/${item.slug}`,
    })),
  };
}