import { PortalLogo } from "@/components/app/PortalLogo";
import { Reveal } from "@/components/marketing/Reveal";
import { PORTALS, PROMOTION_CATALOGS } from "@/lib/portals/registry";

const displayedPortals = [
  ...PORTALS,
  ...PROMOTION_CATALOGS.filter((catalog) => !PORTALS.some((portal) => portal.id === catalog.id)),
];

export function PortalGrid() {
  return (
    <>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {displayedPortals.map((portal, i) => (
          <li key={portal.id}>
            <Reveal delay={i * 50} className="h-full">
              <div className="panel flex h-full items-center gap-3 p-4">
                <PortalLogo portalId={portal.id} name={portal.display_name} fallback={portal.logo} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy">{portal.display_name}</p>
                </div>
              </div>
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