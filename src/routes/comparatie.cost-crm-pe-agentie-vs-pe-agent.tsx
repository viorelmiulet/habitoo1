import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { FaqSection, faqPageJsonLd } from "@/components/marketing/FaqSection";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { OG_IMAGE_URL, SITE_URL, publicHead } from "@/components/marketing/public-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CALCULATOR_EXAMPLE, COST_CALCULATOR as P, compareCost, exampleSentence, formatEur } from "@/lib/marketing/comparison-content";

export const Route = createFileRoute("/comparatie/cost-crm-pe-agentie-vs-pe-agent")({
  head: () => publicHead({
    path: P.path, title: P.seoTitle, description: P.description, ogImage: OG_IMAGE_URL,
    jsonLd: [
      ...pageJsonLd({ path: P.path, name: P.title, description: P.description }),
      { "@type": "WebApplication", "@id": `${SITE_URL}${P.path}#calculator`, name: "Calculator cost CRM: preț pe agenție vs preț pe agent", url: `${SITE_URL}${P.path}`, applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "ro", isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "EUR" } },
      faqPageJsonLd(P.faq),
    ],
  }),
  component: CostCalculatorPage,
});

const example = compareCost(CALCULATOR_EXAMPLE.agents, CALCULATOR_EXAMPLE.pricePerAgent);

function CostCalculatorPage() {
  const [agents, setAgents] = useState<string>(String(CALCULATOR_EXAMPLE.agents));
  const [price, setPrice] = useState<string>(String(CALCULATOR_EXAMPLE.pricePerAgent));
  const r = compareCost(Number(agents), Number(price.replace(",", ".")));
  return (
    <PublicLayout>
      <section className="mk-page-hero border-b">
        <Container className="py-14 sm:py-20">
          <SectionHeading as="h1" align="left" eyebrow="Calculator" title={P.title} text={P.intro} />
        </Container>
      </section>
      <Section>
        <Container className="max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="agents">Număr de agenți</Label><Input id="agents" type="number" min={1} inputMode="numeric" value={agents} onChange={(e) => setAgents(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="price">Preț pe agent pe lună (€)</Label><Input id="price" type="number" min={0} step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-live="polite">
            <div className="rounded-[14px] border border-border p-5">
              <h2 className="text-lg font-semibold text-navy">Acum, preț pe agent</h2>
              <p className="mt-3 text-base">Lunar: <strong>{formatEur(r.currentMonthly)}</strong></p>
              <p className="mt-1 text-base">Anual: <strong>{formatEur(r.currentAnnual)}</strong></p>
            </div>
            <div className="rounded-[14px] border border-primary p-5">
              <h2 className="text-lg font-semibold text-navy">Habitoo {r.planLabel}, preț pe agenție</h2>
              <p className="mt-3 text-base">Plată lunară: <strong>{formatEur(r.habitooMonthly)}</strong> pe lună ({formatEur(r.habitooAnnualMonthlyBilling)} pe an)</p>
              <p className="mt-1 text-base">Plată anuală, −50%: <strong>{formatEur(r.habitooAnnual)}</strong> pe an</p>
            </div>
          </div>
          <p className="mt-6 text-base text-muted-foreground">
            {r.annualSavings > 0 ? `Cu plata anuală, diferența este de ${formatEur(r.annualSavings)} pe an în favoarea Habitoo.` : "Pentru această echipă, prețul actual pe agent este mai mic sau egal cu planul Habitoo la plata anuală."}
          </p>
          <p className="mt-4 rounded-[14px] bg-muted p-4 text-sm text-muted-foreground">{exampleSentence(example)}</p>
          <section className="mt-12">
            <h2 className="text-2xl font-semibold text-navy">Preț pe agent sau preț pe agenție?</h2>
            {P.explanation.map((t) => <p key={t} className="mt-4 text-base leading-relaxed text-muted-foreground">{t}</p>)}
          </section>
          <nav aria-label="Continuă cu" className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
            <Button asChild variant="link" className="h-auto px-0"><Link to="/preturi">Toate prețurile<ArrowRight /></Link></Button>
            <Button asChild variant="link" className="h-auto px-0"><Link to="/comparatie">Cum alegi un CRM imobiliar<ArrowRight /></Link></Button>
            <Button asChild variant="link" className="h-auto px-0"><Link to="/alternative">Cum treci la Habitoo<ArrowRight /></Link></Button>
          </nav>
        </Container>
      </Section>
      <FaqSection title="Întrebări frecvente" items={P.faq} />
      <CtaBand title="Testează Habitoo cu toată echipa." text="90 de zile de acces gratuit, fără card bancar." />
    </PublicLayout>
  );
}
