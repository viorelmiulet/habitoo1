import { FEATURE_PAGES } from "./feature-pages";
import { INTEGRATION_PAGES, DYNAMIC_INTEGRATION_PAGES, portalsLabel, publicPortalCount } from "@/lib/portals/integration-pages";
import type { PortalDefinition } from "@/lib/portals/registry";
import { PLAN_KEYS, PLAN_LABELS, PLAN_PRICES, planAgentLimitLabel } from "@/lib/plans";
import { contentModified } from "./content-revisions";
import type { LlmsStatistics } from "@/lib/blog-discovery";
import { ownerStatisticsText } from "@/components/marketing/owner-listings-content";
import { publicMarketText } from "@/components/marketing/acp-content";
import { PUBLIC_FAQ_GROUPS } from "./public-faq";
import { comparisonLlmsMarkdown } from "./comparison-content";

const documents = import.meta.glob<string>("./content/*.md", { query: "?raw", import: "default", eager: true });
const SITE = "https://www.habitoo.ro";
function faqMarkdown(items: { q: string; a: string }[]) {
  return items.map(item => `### ${item.q}\n\n${item.a}`).join("\n\n");
}
function section(path: string, title: string, body: string) {
  return `## ${title}\n\nSource: ${SITE}${path}\n${contentModified(path) ? `\nActualizat: ${contentModified(path)}\n` : ""}\n${body}`;
}
export function buildLlmsFullTxt(statistics: LlmsStatistics | null = null, observedAt = "2026-11-17T00:00:00Z", dynamic?: PortalDefinition[]) {
  const portals = portalsLabel(publicPortalCount(dynamic));
  const main = Object.entries(documents).map(([file, body]) => {
    const slug = file.split("/").pop()?.replace(/\.md$/, "") ?? "home";
    const statText = slug === "anunturi-proprietari" ? ownerStatisticsText(statistics, observedAt) : publicMarketText(statistics, observedAt);
    const text = slug === "intrebari-frecvente" ? PUBLIC_FAQ_GROUPS.map(group=>`### ${group.title}\n\n${faqMarkdown(group.faqs)}`).join("\n\n") : body.replaceAll("{{PUBLIC_STATISTICS}}", statText).replaceAll("{{PORTALS_LABEL}}", portals);
    return section(slug === "home" ? "/" : `/${slug}`, slug === "home" ? "Habitoo CRM" : slug.replaceAll("-", " "), text);
  });
  const prices = PLAN_KEYS.map(key => `${PLAN_LABELS[key]}: ${PLAN_PRICES[key].monthly} €/lună; ${PLAN_PRICES[key].annualMonthly * 12} €/an; ${planAgentLimitLabel(key)}.`).join("\n\n");
  const features = FEATURE_PAGES.map(p => section(`/functionalitati/${p.slug}`, p.name, [p.h1, ...p.intro, "### Ce câștigi", ...p.benefits.map(b => `**${b.title}**\n\n${b.text}`), "### Cum funcționează", ...p.steps.map(s => `**${s.title}**\n\n${s.text}`), faqMarkdown(p.faq)].join("\n\n")));
  const integrations = [...INTEGRATION_PAGES, ...DYNAMIC_INTEGRATION_PAGES].map(p => section(`/integrari/${p.slug}`, p.name, [...p.intro, p.whyHabitoo, "### Ce poți face", ...p.canDo, "### Cum lucrezi", ...p.dailyWork, "### Activare", p.activationText, ...p.notes, faqMarkdown(p.faq)].join("\n\n")));
  return ["# Habitoo CRM — conținut public complet", "> CRM imobiliar în limba română, pentru agenții și agenți imobiliari din România.", ...main, `## Prețuri și planuri\n\n${prices}`, comparisonLlmsMarkdown(), "## Funcționalități", ...features, "## Integrări", ...integrations].join("\n\n---\n\n") + "\n";
}
export function llmsFullResponse(statistics: LlmsStatistics | null = null, observedAt?: string, dynamic?: PortalDefinition[]) {
  return new Response(buildLlmsFullTxt(statistics, observedAt, dynamic), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=86400" } });
}