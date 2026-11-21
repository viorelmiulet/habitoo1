import { PUBLIC_FAQ_GROUPS } from "@/lib/marketing/public-faq";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, CreditCard, MessageCircle, Rocket, Upload, UserPlus } from "lucide-react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Eyebrow, Section, SectionHeading } from "@/components/marketing/Section";
import { pageJsonLd, SITE_URL } from "@/components/marketing/structured-data";
import { publicHead } from "@/components/marketing/public-head";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const TITLE = "Întrebări frecvente despre CRM imobiliar | Habitoo CRM";
const DESCRIPTION =
  "Răspunsuri despre Habitoo CRM: publicarea pe portaluri, prețuri și perioada de probă, importul din alt CRM, ansambluri rezidențiale, chat și activarea contului.";

type Faq = { q: string; a: string };
type FaqGroup = { id: string; icon: typeof Rocket; title: string; faqs: Faq[] };

const GROUP_ICONS: Record<string, typeof Rocket> = { portaluri: Rocket, preturi: CreditCard, import: Upload, ansambluri: Building2, chat: MessageCircle, cont: UserPlus };

export const FAQ_GROUPS: FaqGroup[] = PUBLIC_FAQ_GROUPS.map(group => ({ ...group, icon: GROUP_ICONS[group.id] ?? UserPlus }));
const allFaqs = FAQ_GROUPS.flatMap((g) => g.faqs);

/** FAQPage node built from the same list the page renders. */
export function faqPageNode() {
  return {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/intrebari-frecvente#faq`,
    isPartOf: { "@id": `${SITE_URL}/intrebari-frecvente#webpage` },
    mainEntity: allFaqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export const Route = createFileRoute("/intrebari-frecvente")({
  head: () =>
    publicHead({
      path: "/intrebari-frecvente",
      title: TITLE,
      description: DESCRIPTION,
      jsonLd: [
        ...pageJsonLd({ path: "/intrebari-frecvente", name: "Întrebări frecvente", description: DESCRIPTION }),
        faqPageNode(),
      ],
    }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <PublicLayout footerDescription="CRM imobiliar pentru agențiile din România, într-o singură platformă.">
      <section className="mk-page-hero border-b">
        <Container className="py-16 sm:py-20 lg:py-24">
          <SectionHeading
            as="h1"
            title="Întrebări frecvente"
            text="Răspunsuri despre publicarea pe portaluri, prețuri și perioada de probă, importul din alt CRM, ansambluri rezidențiale, chat și activarea contului."
          />
        </Container>
      </section>

      {FAQ_GROUPS.map((group, gi) => (
        <Section key={group.id} tone={gi % 2 === 1 ? "muted" : undefined}>
          <Container className="max-w-3xl">
            <Reveal>
              <Eyebrow>
                <group.icon className="size-3.5" /> {group.title}
              </Eyebrow>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-navy sm:text-3xl">
                {group.title}
              </h2>
            </Reveal>
            <Accordion type="single" collapsible className="mt-8">
              {group.faqs.map((f, i) => (
                <AccordionItem key={f.q} value={`${group.id}-${i}`}>
                  <AccordionTrigger className="text-left text-base font-medium">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Container>
        </Section>
      ))}

      <Section>
        <Container className="max-w-3xl text-center">
          <p className="text-base text-muted-foreground">
            Nu ai găsit răspunsul? Vezi{" "}
            <Link to="/functionalitati" className="font-medium text-primary underline-offset-4 hover:underline">
              funcționalitățile
            </Link>
            ,{" "}
            <Link to="/integrari" className="font-medium text-primary underline-offset-4 hover:underline">
              integrările cu portalurile
            </Link>{" "}
            sau scrie-ne din pagina de{" "}
            <Link to="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
              contact
            </Link>
            .
          </p>
        </Container>
      </Section>

      <CtaBand
        title="Testează Habitoo cu agenția ta."
        text="Creează agenția în câteva minute, invită echipa și publică primele anunțuri pe portaluri dintr-un singur loc."
      />
    </PublicLayout>
  );
}
