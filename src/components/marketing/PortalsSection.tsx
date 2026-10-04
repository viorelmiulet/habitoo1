import { Check, Share2 } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { PortalGrid } from "@/components/marketing/PortalGrid";

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

        <PortalGrid />
      </Container>
    </Section>
  );
}
