import { Link } from "@tanstack/react-router";
import { hasPortalLogo, portalLogoSrc } from "@/components/app/PortalLogo";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Eyebrow, Section } from "@/components/marketing/Section";
import { homepagePortals, integrationSlugFor, portalsLabel, publicPortalCount } from "@/lib/portals/integration-pages";
import type { PortalDefinition } from "@/lib/portals/registry";

const integratedPortals = homepagePortals();

export function IntegratedPortalsSection({ dynamic = [] }: { dynamic?: PortalDefinition[] }) {
  return (
    <Section id="portaluri" className="pt-12 sm:pt-16">
      <Container>
        <div className="ds-panel p-6 sm:p-10 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
            <div>
              <Eyebrow>Integrări</Eyebrow>
              <h2 className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1 text-3xl text-balance sm:text-4xl">
                <span className="text-6xl leading-none font-bold sm:text-8xl">{publicPortalCount(dynamic)}</span>
                <span className="sr-only"> </span>
                <span className="pb-1">CRM-ul imobiliar cu cele mai multe integrări: {portalsLabel(publicPortalCount(dynamic))} dintr-un singur loc</span>
              </h2>
            </div>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
              Introduci proprietatea o dată și ajunge pe toate portalurile alese, cu actualizare și retragere automată. Cererile clienților de pe portalurile care le trimit intră direct în CRM.
            </p>
          </div>
          <ul className="mt-10 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {[...integratedPortals, ...dynamic.map(portal => ({ portal, label: portal.display_name }))].map(({ portal, label }, i) => {
              const slug = integrationSlugFor(portal.id);
              const content = (
                <>
                  <span className="ds-logo-plate w-full" data-logo-plate>
                    {portal.logo_url ? (
                      <img src={portal.logo_url} alt={`Logo ${portal.display_name}`} width={120} height={36} loading="lazy" decoding="async" />
                    ) : hasPortalLogo(portal.id) ? (
                      <img src={portalLogoSrc(portal.id)} alt={`Logo ${portal.display_name}`} width={120} height={36} loading="lazy" decoding="async" className="max-w-[140px]" />
                    ) : (
                      <span className="font-mono text-xs font-medium text-[#1A2440]">{portal.logo}</span>
                    )}
                  </span>
                  <span className="min-w-0 truncate font-mono text-xs ds-text-2">{label}</span>
                </>
              );
              return (
              <li key={portal.id}>
                <Reveal delay={i * 30} className="h-full">
                  {slug ? (
                    <Link to="/integrari/$slug" params={{ slug }} className="ds-card flex h-full min-w-0 flex-col items-start gap-2.5 p-3 transition-colors hover:border-[color:var(--ds-line-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</Link>
                  ) : (
                    <div className="ds-card flex h-full min-w-0 flex-col items-start gap-2.5 p-3">{content}</div>
                  )}
                </Reveal>
              </li>
              );
            })}
          </ul>
          <div className="mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <p className="text-xs ds-text-3">Numele și logo-urile portalurilor aparțin deținătorilor lor.</p>
            <Link to="/integrari" className="ds-btn ds-btn-ghost">Vezi toate integrările</Link>
          </div>
        </div>
      </Container>
    </Section>
  );
}
