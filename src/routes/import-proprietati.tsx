import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { publicHead, SITE_URL } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { FaqSection, faqPageJsonLd } from "@/components/marketing/FaqSection";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PublicPhotoHeading } from "@/components/marketing/PublicPhotoHeading";
import { publicPagePhotos, publicPhotoHead } from "@/components/marketing/public-page-photos";
import {
  PUBLIC_PROPERTY_IMPORT_PATH,
  PUBLIC_PROPERTY_IMPORT_TITLE,
  PUBLIC_PROPERTY_IMPORT_DESCRIPTION,
  propertyImportSections,
  propertyImportLimitations,
  propertyImportFaq,
} from "@/components/marketing/property-import-content";

export const Route = createFileRoute("/import-proprietati")({
  head: () => publicHead({
    path: PUBLIC_PROPERTY_IMPORT_PATH,
    title: PUBLIC_PROPERTY_IMPORT_TITLE,
    description: PUBLIC_PROPERTY_IMPORT_DESCRIPTION,
    ...publicPhotoHead(publicPagePhotos.propertyImport),
    jsonLd: [
      ...pageJsonLd({ path: PUBLIC_PROPERTY_IMPORT_PATH, name: "Import proprietăți", description: PUBLIC_PROPERTY_IMPORT_DESCRIPTION }),
      {
        ...faqPageJsonLd(propertyImportFaq),
        "@id": `${SITE_URL}${PUBLIC_PROPERTY_IMPORT_PATH}#faq`,
        isPartOf: { "@id": `${SITE_URL}${PUBLIC_PROPERTY_IMPORT_PATH}#webpage` },
      },
    ],
  }),
  component: PublicPropertyImportPage,
});

function PublicPropertyImportPage() {
  return (
    <PublicLayout>
      <section className="border-b border-border bg-muted/40">
        <Container className="py-14 sm:py-20">
          <PublicPhotoHeading photo={publicPagePhotos.propertyImport}>
            <SectionHeading
              as="h1"
              align="left"
              eyebrow="Import proprietăți"
              title="Mută-ți proprietățile în Habitoo din alt CRM"
              text="Proprietățile din IMMOFLUX intră în Habitoo cu fotografii, caracteristici și locație, iar anunțurile de la proprietari ajung în portofoliu cu acordul acestora. Fără dubluri și fără publicare automată pe portaluri."
            />
          </PublicPhotoHeading>
        </Container>
      </section>
      <Section className="py-12 sm:py-16 lg:py-16">
        <Container className="max-w-3xl">
          {propertyImportSections.map((section, index) => (
            <section key={section.title} className={index === 0 ? undefined : "mt-12 border-t border-border pt-10"}>
              <SectionHeading align="left" title={section.title} text={section.text} />
            </section>
          ))}
          <section className="mt-12 border-t border-border pt-10">
            <SectionHeading align="left" title="Ce nu face importul" />
            <ul className="mt-6 list-disc space-y-3 pl-5 text-base leading-relaxed text-muted-foreground">
              {propertyImportLimitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </Container>
      </Section>
      <FaqSection title="Întrebări frecvente" items={propertyImportFaq} />
      <Section tone="muted" className="py-12 sm:py-14 lg:py-14">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Continuă cu" />
          <nav aria-label="Continuă cu" className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {([
              { to: "/functionalitati", label: "Funcționalități" },
              { to: "/anunturi-proprietari", label: "Anunțuri de la proprietari" },
              { to: "/preturi", label: "Prețuri" },
            ] as const).map((link) => (
              <Button key={link.to} asChild variant="link" className="h-auto whitespace-normal px-0 text-left">
                <Link to={link.to}>{link.label}<ArrowRight className="shrink-0" /></Link>
              </Button>
            ))}
          </nav>
        </Container>
      </Section>
      <CtaBand />
    </PublicLayout>
  );
}
