import { Check, Share2 } from "lucide-react";
import { PortalLogo } from "@/components/app/PortalLogo";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { PORTALS } from "@/lib/portals/registry";

const benefits = [
  "Bifezi portalurile o singură dată, din fișa proprietății",
  "Modificările de preț sau fotografii ajung automat mai departe",
  "Când retragi oferta, dispare și de pe portaluri",
];

export function PortalsSection() {
  return (
    <Section id="portaluri">
      <Container>
        <SectionHeading
          eyebrow={
            <>
              <Share2 className="size-3.5" /> Publicare pe portaluri
            </>
          }
          title="Publică automat anunțurile pe cele mai importante portaluri imobiliare din România, direct din Habitoo — fără muncă dublă."
          text="Introduci proprietatea o singură dată în Habitoo și alegi unde vrei să apară. Restul se întâmplă singur: economisești timp și ajungi pe toate canalele dintr-un singur click."
        />

        <ul className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-3">
          {benefits.map((b) => (
            <li
              key={b}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground"
            >
              <Check className="size-4 shrink-0 text-success" />
              {b}
            </li>
          ))}
        </ul>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PORTALS.map((portal, i) => (
            <li key={portal.id}>
              <Reveal delay={i * 50} className="h-full">
                <div className="panel flex h-full items-center gap-3 p-4">
                  <PortalLogo
                    portalId={portal.id}
                    name={portal.display_name}
                    fallback={portal.logo}
                    size={40}
                  />
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
      </Container>
    </Section>
  );
}
