import { hasPortalLogo, PortalLogo } from "@/components/app/PortalLogo";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { isPortalCovered, PORTAL_GROUPS, PORTALS } from "@/lib/portals/registry";

const integratedPortals = PORTALS.filter(
  (portal) =>
    portal.status === "available" &&
    !isPortalCovered(portal.id) &&
    // OLX direct (cont prepaid) rămâne doar în aplicație; pe homepage OLX
    // apare deja prin cardul Storia+OLX.
    portal.id !== "olx_direct",
);

/** Portalurile care acoperă alte portaluri (ex. Storia+OLX) își arată grupul pe homepage. */
function homepageLabel(portalId: string, fallback: string): string {
  const group = PORTAL_GROUPS.find((g) => g.primary === portalId);
  return group ? group.label : fallback;
}

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
          {integratedPortals.map((portal, i) => (
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
                        alt={portal.display_name}
                        className="shrink-0"
                      />
                      <span className="truncate text-sm font-semibold text-navy">
                        {portal.display_name}
                      </span>
                    </>
                  ) : (
                    <span className="truncate text-sm font-semibold text-navy">
                      {portal.display_name}
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
