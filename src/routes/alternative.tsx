import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { FaqSection, faqPageJsonLd } from "@/components/marketing/FaqSection";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { OG_IMAGE_URL, publicHead } from "@/components/marketing/public-head";
import { ComparisonLink } from "@/components/marketing/ComparisonLink";
import { Button } from "@/components/ui/button";
import { ALTERNATIVE_PAGE as P } from "@/lib/marketing/comparison-content";

export const Route = createFileRoute("/alternative")({
  head: () => publicHead({
    path: P.path, title: P.seoTitle, description: P.description, ogImage: OG_IMAGE_URL,
    jsonLd: [...pageJsonLd({ path: P.path, name: P.title, description: P.description }), faqPageJsonLd(P.faq)],
  }),
  component: AlternativePage,
});

function AlternativePage() {
  return (
    <PublicLayout>
      <section className="mk-page-hero border-b">
        <Container className="py-14 sm:py-20">
          <SectionHeading as="h1" align="left" eyebrow="Schimbarea CRM-ului" title={P.title} text={P.intro} />
        </Container>
      </section>
      <Section>
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Pașii mutării" />
          <div className="mt-8 space-y-6">
            {P.steps.map((s) => (
              <section key={s.title} className="rounded-[14px] border border-border p-5">
                <h2 className="text-lg font-semibold text-navy">{s.title}</h2>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{s.text}</p>
                <ComparisonLink to={s.to} className="mt-3 inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">{s.linkLabel}<ArrowRight className="size-4" /></ComparisonLink>
              </section>
            ))}
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <section>
              <h2 className="text-xl font-semibold text-navy">Ce se păstrează</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-base text-muted-foreground">{P.kept.map((k) => <li key={k}>{k}</li>)}</ul>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-navy">Ce trebuie verificat</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-base text-muted-foreground">{P.check.map((k) => <li key={k}>{k}</li>)}</ul>
            </section>
          </div>
          <nav aria-label="Continuă cu" className="mt-12 flex flex-wrap gap-x-6 gap-y-2">
            <Button asChild variant="link" className="h-auto px-0"><Link to="/comparatie">Cum alegi un CRM imobiliar<ArrowRight /></Link></Button>
            <Button asChild variant="link" className="h-auto px-0"><Link to="/comparatie/cost-crm-pe-agentie-vs-pe-agent">Calculator de cost<ArrowRight /></Link></Button>
          </nav>
        </Container>
      </Section>
      <FaqSection title="Întrebări frecvente" items={P.faq} />
      <CtaBand title="Mută-ți agenția în Habitoo." text="Importă proprietățile, invită echipa și testează 90 de zile gratuit, fără card bancar." />
    </PublicLayout>
  );
}
