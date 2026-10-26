import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { publicHead, SITE_URL } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { FaqSection, faqPageJsonLd } from "@/components/marketing/FaqSection";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { CtaBand } from "@/components/marketing/CtaBand";
import {
  PUBLIC_COLLABORATION_PATH,
  PUBLIC_COLLABORATION_TITLE,
  PUBLIC_COLLABORATION_DESCRIPTION,
  collaborationSections,
  collaborationLimitations,
  collaborationFaq,
} from "@/components/marketing/collaboration-content";

export const Route = createFileRoute("/colaborare-intre-agentii")({
  head: () => publicHead({
    path: PUBLIC_COLLABORATION_PATH,
    title: PUBLIC_COLLABORATION_TITLE,
    description: PUBLIC_COLLABORATION_DESCRIPTION,
    jsonLd: [
      ...pageJsonLd({ path: PUBLIC_COLLABORATION_PATH, name: "Colaborare între agenții", description: PUBLIC_COLLABORATION_DESCRIPTION }),
      {
        ...faqPageJsonLd(collaborationFaq),
        "@id": `${SITE_URL}${PUBLIC_COLLABORATION_PATH}#faq`,
        isPartOf: { "@id": `${SITE_URL}${PUBLIC_COLLABORATION_PATH}#webpage` },
      },
    ],
  }),
  component: PublicCollaborationPage,
});

function PublicCollaborationPage() {
  return (
    <PublicLayout>
      <section className="border-b border-border bg-muted/40">
        <Container className="py-14 sm:py-20">
          <SectionHeading
            as="h1"
            eyebrow="Colaborare între agenții"
            title="Colaborare între agenții: proprietăți comune, clienți proprii, comision stabilit de tine"
            text="Agențiile din Habitoo își pot deschide proprietățile către alte agenții din platformă. Tu alegi ce proprietăți oferi și ce comision dai, iar agenția parteneră vine cu clientul. Datele proprietarului și notele interne nu ies din agenția ta."
          />
        </Container>
      </section>
      <Section className="py-12 sm:py-16 lg:py-16">
        <Container className="max-w-3xl">
          {collaborationSections.map((section, index) => (
            <section key={section.title} className={index === 0 ? undefined : "mt-12 border-t border-border pt-10"}>
              <SectionHeading align="left" title={section.title} text={section.text} />
            </section>
          ))}
          <section className="mt-12 border-t border-border pt-10">
            <SectionHeading align="left" title="Colaborarea și ACP" text="Ofertele deschise colaborării de partenerii tăi pot intra ca sursă în analiza comparativă de piață, alături de proprietățile agenției și ofertele de piață." />
            <Button asChild variant="link" className="mt-4 h-auto whitespace-normal px-0 text-left">
              <Link to="/analiza-comparativa-de-piata">Analiză comparativă de piață<ArrowRight className="shrink-0" /></Link>
            </Button>
          </section>
          <section className="mt-12 border-t border-border pt-10">
            <SectionHeading align="left" title="Cine participă" text="Agențiile Habitoo cu cont activ sau în perioada de probă, care au colaborarea pornită în Setări → Agenție. O agenție care o oprește nu își mai arată proprietățile și nici nu vede ofertele celorlalte." />
          </section>
          <section className="mt-12 border-t border-border pt-10">
            <SectionHeading align="left" title="Ce nu face colaborarea" />
            <ul className="mt-6 list-disc space-y-3 pl-5 text-base leading-relaxed text-muted-foreground">
              {collaborationLimitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </Container>
      </Section>
      <FaqSection title="Întrebări frecvente" items={collaborationFaq} />
      <Section tone="muted" className="py-12 sm:py-14 lg:py-14">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Continuă cu" />
          <nav aria-label="Continuă cu" className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {([
              { to: "/analiza-comparativa-de-piata", label: "Analiză comparativă de piață" },
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