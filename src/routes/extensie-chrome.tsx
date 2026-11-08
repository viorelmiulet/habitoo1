import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { publicHead, SITE_URL } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { FaqSection, faqPageJsonLd } from "@/components/marketing/FaqSection";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { CtaBand } from "@/components/marketing/CtaBand";
import {
  CHROME_EXTENSION_DESCRIPTION, CHROME_EXTENSION_META_TITLE, CHROME_EXTENSION_PATH, CHROME_EXTENSION_TITLE,
  chromeInstallButton, extensionFaq, extensionSites, extensionSteps,
} from "@/components/marketing/chrome-extension-content";

export const Route = createFileRoute("/extensie-chrome")({
  head: () => publicHead({
    path: CHROME_EXTENSION_PATH,
    title: CHROME_EXTENSION_META_TITLE,
    description: CHROME_EXTENSION_DESCRIPTION,
    jsonLd: [
      ...pageJsonLd({ path: CHROME_EXTENSION_PATH, name: CHROME_EXTENSION_TITLE, description: CHROME_EXTENSION_DESCRIPTION }),
      { ...faqPageJsonLd(extensionFaq), "@id": `${SITE_URL}${CHROME_EXTENSION_PATH}#faq`, isPartOf: { "@id": `${SITE_URL}${CHROME_EXTENSION_PATH}#webpage` } },
    ],
  }),
  component: ChromeExtensionPage,
});

function InstallButton() {
  const b = chromeInstallButton();
  if (b.disabled) return <Button size="lg" disabled aria-disabled="true">{b.label}</Button>;
  return <Button size="lg" asChild><a href={b.href} target="_blank" rel="noopener noreferrer">{b.label}<ArrowRight /></a></Button>;
}

function ChromeExtensionPage() {
  return (
    <PublicLayout>
      <section className="mk-page-hero border-b">
        <Container className="py-14 sm:py-20">
          <SectionHeading as="h1" eyebrow="Integrări" title={CHROME_EXTENSION_TITLE} text={CHROME_EXTENSION_DESCRIPTION} />
          <div className="mt-8 flex justify-center"><InstallButton /></div>
        </Container>
      </section>
      <Section className="py-12 sm:py-16 lg:py-16">
        <Container>
          <SectionHeading title="Trei pași" />
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {extensionSteps.map((s, i) => (
              <li key={s.title} className="rounded-[14px] border border-border bg-card p-6">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground">{i + 1}</span>
                <h2 className="mt-4 text-lg font-semibold text-navy">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>
      <Section tone="muted" className="py-12 sm:py-16 lg:py-16">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Unde apare butonul de import" text="Pe aceste portaluri butonul Habitoo apare direct în pagina anunțului:" />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {extensionSites.map((s) => <li key={s} className="flex items-center gap-2 text-base"><Check className="h-4 w-4 text-primary" />{s}</li>)}
            <li className="flex items-center gap-2 text-base sm:col-span-2"><Check className="h-4 w-4 text-primary" />orice alt site, cu formular precompletat</li>
          </ul>
        </Container>
      </Section>
      <Section className="py-12 sm:py-16 lg:py-16">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Postează în grupuri Facebook cu datele tale de contact" text="Extensia îți arată anunțurile tale active din Habitoo, cu text și poze gata pregătite. La final apar numele, telefonul și WhatsApp-ul tău din profil, nu ale agenției. Tu apeși „Postează”, iar Habitoo notează în fișa anunțului grupul și data, ca să nu postezi de două ori în același grup." />
        </Container>
      </Section>
      <FaqSection title="Întrebări frecvente" items={extensionFaq} />
      <Section tone="muted" className="py-12 sm:py-14 lg:py-14">
        <Container className="max-w-3xl">
          <p className="text-base text-muted-foreground">Ce date folosește extensia și cum le protejăm:</p>
          <Button asChild variant="link" className="mt-2 h-auto whitespace-normal px-0 text-left">
            <Link to="/politica-de-confidentialitate" hash="extensie-chrome">Politica de confidențialitate a extensiei<ArrowRight className="shrink-0" /></Link>
          </Button>
        </Container>
      </Section>
      <CtaBand />
    </PublicLayout>
  );
}
