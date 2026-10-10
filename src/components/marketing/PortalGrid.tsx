import { Link } from "@tanstack/react-router";
import { integrationSlugFor } from "@/lib/portals/integration-pages";
import { PortalLogo } from "@/components/app/PortalLogo";
import { Reveal } from "@/components/marketing/Reveal";
import { PORTALS, PROMOTION_CATALOGS } from "@/lib/portals/registry";

const displayedPortals = [
  ...PORTALS,
  ...PROMOTION_CATALOGS.filter((catalog) => !PORTALS.some((portal) => portal.id === catalog.id)),
];

/** `linkToPages`: fiecare card duce la pagina integrării (/integrari/<slug>). */
export function PortalGrid({ linkToPages = false }: { linkToPages?: boolean } = {}) {
  return (
    <>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {displayedPortals.map((portal, i) => (
          <li key={portal.id}>
            <Reveal delay={i * 50} className="h-full">
              {(() => {
                const inner = (
                  <>
                    <PortalLogo portalId={portal.id} name={portal.display_name} fallback={portal.logo} size={40} alt={`Logo ${portal.display_name}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">{portal.display_name}</p>
                    </div>
                  </>
                );
                const slug = linkToPages ? integrationSlugFor(portal.id) : null;
                return slug ? (
                  <Link to="/integrari/$slug" params={{ slug }} className="panel flex h-full items-center gap-3 p-4 transition-shadow hover:shadow-float">
                    {inner}
                  </Link>
                ) : (
                  <div className="panel flex h-full items-center gap-3 p-4">{inner}</div>
                );
              })()}
            </Reveal>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Numele și logo-urile portalurilor aparțin deținătorilor lor și sunt afișate pentru a
        indica integrările suportate de platformă.
      </p>
    </>
  );
}