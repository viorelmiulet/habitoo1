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
  PUBLIC_COMMISSIONS_PATH,
  PUBLIC_COMMISSIONS_TITLE,
  PUBLIC_COMMISSIONS_DESCRIPTION,
  commissionsSections,
  commissionsLimitations,
  commissionsFaq,
} from "@/components/marketing/commissions-content";

export const Route = createFileRoute("/comisioane-agenti-imobiliari")({
  head: () => publicHead({
    path: PUBLIC_COMMISSIONS_PATH,
    title: PUBLIC_COMMISSIONS_TITLE,
    description: PUBLIC_COMMISSIONS_DESCRIPTION,
    ...publicPhotoHead(publicPagePhotos.commissions),
    jsonLd: [
      ...pageJsonLd({ path: PUBLIC_COMMISSIONS_PATH, name: "Evidența comisioanelor", description: PUBLIC_COMMISSIONS_DESCRIPTION }),
      {
        ...faqPageJsonLd(commissionsFaq),
        "@id": `${SITE_URL}${PUBLIC_COMMISSIONS_PATH}#faq`,
        isPartOf: { "@id": `${SITE_URL}${PUBLIC_COMMISSIONS_PATH}#webpage` },
      },
    ],
  }),
  component: PublicCommissionsPage,
});

function PublicCommissionsPage() {
  return (
    <PublicLayout>
      <section className="border-b border-border bg-muted/40">
        <Container className="py-14 sm:py-20">
          <PublicPhotoHeading photo={publicPagePhotos.commissions}>
            <SectionHeading
              as="h1"
              align="left"
              eyebrow="Comisioane"
              title="Evidența comisioanelor pentru agenții imobiliare"
              text="Fiecare tranzacție are comisionul ei: cât încasează agenția, cât revine agentului, cine plătește și dacă banii au intrat. Rapoartele și exporturile folosesc cursul BNR din ziua tranzacției."
            />
          </PublicPhotoHeading>
        </Container>
      </section>
      <Section className="py-12 sm:py-16 lg:py-16">
        <Container className="max-w-3xl">
          {commissionsSections.map((section, index) => (
            <section key={section.title} className={index === 0 ? undefined : "mt-12 border-t border-border pt-10"}>
              <SectionHeading align="left" title={section.title} text={section.text} />
            </section>
          ))}
          <section className="mt-12 border-t border-border pt-10">
            <SectionHeading align="left" title="Ce nu face modulul de comisioane" />
            <ul className="mt-6 list-disc space-y-3 pl-5 text-base leading-relaxed text-muted-foreground">
              {commissionsLimitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </Container>
      </Section>
      <FaqSection title="Întrebări frecvente" items={commissionsFaq} />
      <Section tone="muted" className="py-12 sm:py-14 lg:py-14">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Continuă cu" />
          <nav aria-label="Continuă cu" className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {([
              { to: "/functionalitati", label: "Funcționalități" },
              { to: "/colaborare-intre-agentii", label: "Colaborare între agenții" },
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
