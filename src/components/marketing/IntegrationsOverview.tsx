import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PortalLogo } from "@/components/app/PortalLogo";
import { INTEGRATION_OVERVIEW, INTEGRATION_SECTIONS } from "@/lib/portals/integration-overview";
import { integrationBadges } from "@/lib/portals/integration-overview";
import type { PortalDefinition } from "@/lib/portals/registry";

export function IntegrationsOverview({ dynamic = [] }: { dynamic?: PortalDefinition[] }) {
  return <div className="space-y-12">{INTEGRATION_SECTIONS.map((section) => <section key={section} aria-label={section}>
    <div className="mb-6 flex items-center gap-4"><h2 className="text-2xl text-navy">{section}</h2><span aria-hidden="true" className="h-px flex-1 bg-border" /></div>
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3">{INTEGRATION_OVERVIEW.filter((item) => item.section === section).map((item) => <li key={item.id} className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-6" data-integration={item.id}>
      <div className="mb-4 flex flex-wrap items-center gap-2">{item.logoIds.map((id) => <PortalLogo key={id} portalId={id} name={item.name} size={40} alt={`Logo ${id}`} />)}</div>
      <h3 className="font-sans text-lg font-semibold text-navy">{item.name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
      <ul className="my-5 flex flex-wrap gap-2">{item.badges.map((badge) => <li key={badge} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground"><Check className="size-3 shrink-0 text-success" />{badge}</li>)}</ul>
      <Button asChild variant="link" className="mt-auto h-auto justify-start self-start p-0 text-gold-dark"><Link to="/integrari/$slug" params={{ slug: item.slug }} aria-label={`Vezi detalii: ${item.name}`}>Vezi detalii <ArrowUpRight className="size-4" /></Link></Button>
    </li>)}{section === INTEGRATION_SECTIONS[0] && dynamic.map(portal => <li key={portal.id} className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-6" data-integration={portal.id}>
      {portal.logo_url && <img src={portal.logo_url} alt={`Logo ${portal.display_name}`} className="mb-4 size-10 object-contain" />}
      <h3 className="text-lg font-semibold text-navy">{portal.display_name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{portal.description}</p>
      <ul className="my-5 flex flex-wrap gap-2">{integrationBadges(portal).map(badge => <li key={badge} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"><Check className="size-3 text-success" />{badge}</li>)}</ul>
      <Button asChild variant="link" className="mt-auto h-auto justify-start self-start p-0 text-gold-dark"><a href={portal.website} target="_blank" rel="noopener noreferrer">Site-ul portalului <ArrowUpRight className="size-4" /></a></Button>
    </li>)}</ul>
  </section>)}<p className="text-center text-xs text-muted-foreground">Numele și logo-urile portalurilor aparțin deținătorilor lor.</p></div>;
}