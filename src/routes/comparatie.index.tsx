import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { FaqSection, faqPageJsonLd } from "@/components/marketing/FaqSection";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { OG_IMAGE_URL, publicHead } from "@/components/marketing/public-head";
import { ComparisonLink } from "@/components/marketing/ComparisonLink";
import { Button } from "@/components/ui/button";
import { COMPARISON_HUB as P } from "@/lib/marketing/comparison-content";

export const Route = createFileRoute("/comparatie/")({
  head: () => publicHead({
    path: P.path, title: P.seoTitle, description: P.description, ogImage: OG_IMAGE_URL,
    jsonLd: [...pageJsonLd({ path: P.path, name: P.title, description: P.description }), faqPageJsonLd(P.faq)],
  }),
  component: ComparisonHub,
});

function ComparisonHub() {
  return (
    <PublicLayout>
      <section className="mk-page-hero border-b">
        <Container className="py-14 sm:py-20">
          <SectionHeading as="h1" align="left" eyebrow="Ghid" title={P.title} text={P.intro} />
        </Container>
      </section>
      <Section>
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Lista de verificare" />
          <ol className="mt-8 space-y-6">
            {P.checklist.map((c, i) => (
              <li key={c.title} className="rounded-[14px] border border-border p-5">
                <h2 className="text-lg font-semibold text-navy">{i + 1}. {c.title}</h2>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{c.text}</p>
                <p className="mt-3 flex items-start gap-2 text-base">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-primary" />
                  <span>În Habitoo: {c.habitoo}{" "}<ComparisonLink to={c.to} className="font-medium text-primary underline-offset-4 hover:underline">{c.linkLabel}</ComparisonLink></span>
                </p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>
      <Section tone="muted">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Continuă cu" />
          <nav aria-label="Continuă cu" className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            <Button asChild variant="link" className="h-auto px-0"><Link to="/comparatie/cost-crm-pe-agentie-vs-pe-agent">Calculator: preț pe agenție vs pe agent<ArrowRight /></Link></Button>
            <Button asChild variant="link" className="h-auto px-0"><Link to="/alternative">Cum treci la Habitoo<ArrowRight /></Link></Button>
          </nav>
        </Container>
      </Section>
      <FaqSection title="Întrebări frecvente" items={P.faq} />
      <CtaBand title="Verifică lista pe date reale." text="Creează agenția, importă proprietățile și testează 90 de zile gratuit, fără card bancar." />
    </PublicLayout>
  );
}
