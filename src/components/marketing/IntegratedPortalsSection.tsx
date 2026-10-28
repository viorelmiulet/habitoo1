import { hasPortalLogo, PortalLogo } from "@/components/app/PortalLogo";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { homepagePortals } from "@/lib/portals/integration-pages";

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
          {integratedPortals.map(({ portal, label }, i) => (
            <li key={portal.id}>
              <Reveal delay={i * 40} className="h-full">
                <div className="panel flex h-full min-w-0 items-center gap-3 p-4">
                  {hasPortalLogo(portal.id) ? (
                    <>
                      <PortalLogo
                        portalId={portal.id}
                        name={portal.display_name}
                        fallback={portal.logo}
                        size={40}
                        alt={`Logo ${portal.display_name}`}
                        className="shrink-0"
                      />
                      <span className="truncate text-sm font-semibold text-navy">
                        {label}
                      </span>
                    </>
                  ) : (
                    <span className="truncate text-sm font-semibold text-navy">
                      {label}
                    </span>
                  )}
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Numele și logo-urile portalurilor aparțin deținătorilor lor.
        </p>
      </Container>
    </Section>
  );
}
