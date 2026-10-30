import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { hasPortalLogo, PortalLogo } from "@/components/app/PortalLogo";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { homepagePortals, integrationSlugFor } from "@/lib/portals/integration-pages";

const integratedPortals = homepagePortals();

export function IntegratedPortalsSection() {
  return (
    <Section id="portaluri" className="pt-12 sm:pt-16">
      <Container>
        <SectionHeading
          eyebrow="Integrări"
          title={
            <>
              Portaluri <span className="text-gold">integrate</span>
            </>
          }
          text="Publici anunțurile direct din Habitoo, pe portalurile folosite de agențiile din România."
        />
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {integratedPortals.map(({ portal, label }, i) => {
            const slug = integrationSlugFor(portal.id);
            const content = (
              <>
                {hasPortalLogo(portal.id) && (
                  <PortalLogo portalId={portal.id} name={portal.display_name} fallback={portal.logo} size={40} alt={`Logo ${portal.display_name}`} className="shrink-0" />
                )}
                <span className="min-w-0 text-sm font-semibold text-navy">{label}</span>
              </>
            );
            return (
            <li key={portal.id}>
              <Reveal delay={i * 40} className="h-full">
                {slug ? (
                  <Link to="/integrari/$slug" params={{ slug }} className="panel flex h-full min-w-0 items-center gap-3 p-4 transition-shadow hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</Link>
                ) : (
                  <div className="panel flex h-full min-w-0 items-center gap-3 p-4">{content}</div>
                )}
              </Reveal>
            </li>
            );
          })}
        </ul>
        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline">
            <Link to="/integrari">Vezi toate integrările</Link>
          </Button>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Numele și logo-urile portalurilor aparțin deținătorilor lor.
        </p>
      </Container>
    </Section>
  );
}
