import { ArrowRight, CircleCheck, Link2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CookieConsent } from "@/components/marketing/CookieConsent";
import { CrmLink } from "@/components/marketing/CrmLink";
import { FaqSection } from "@/components/marketing/FaqSection";
import { IntegratedPortalsSection } from "@/components/marketing/IntegratedPortalsSection";
import { HomeHeader } from "@/components/marketing/HomeHeader";
import { HomePricingSection } from "@/components/marketing/HomePricingSection";
import { PublicFooter } from "@/components/marketing/PublicFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Eyebrow, Section, SectionHeading } from "@/components/marketing/Section";
import { DashboardMock } from "@/components/marketing/mockups/DashboardMock";
import { AiTypingPanel } from "./AiTypingPanel";
import { AI_CARDS, HOME_FAQ, HOME_FEATURES, HOME_STEPS } from "./home-content";
import { portalsLabel, publicPortalCount } from "@/lib/portals/integration-pages";
import type { PortalDefinition } from "@/lib/portals/registry";

export function HomeContent({ dynamic }: { dynamic: PortalDefinition[] }) {
  const portalCount = publicPortalCount(dynamic);
  const trust = [
    { icon: Link2, label: `${portalsLabel(portalCount)} integrate` },
    { icon: CircleCheck, label: "90 de zile gratuit, fără card" },
    { icon: ShieldCheck, label: "Date separate pe agenții" },
  ];
  return (
    <div className="mk-root min-h-screen overflow-x-hidden bg-background text-foreground">
      <a href="#continut" className="sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:not-sr-only focus:rounded-full focus:bg-background focus:px-4 focus:py-2">
        Sari la conținut
      </a>
      <HomeHeader />
      <main id="continut">
        <section className="hp-hero-bg relative overflow-hidden pt-[88px] text-navy-foreground lg:pt-[104px]">
          <div aria-hidden className="home-grid pointer-events-none absolute inset-0 opacity-40" />
          <div aria-hidden className="home-glow home-glow-one" />
          <Container className="relative grid items-center gap-12 pb-24 pt-8 lg:min-h-[760px] lg:grid-cols-[1fr_1fr] lg:gap-14 lg:pb-32 lg:pt-12">
            <div className="max-w-2xl">
              <Eyebrow tone="gold">
                <Sparkles className="size-3.5" aria-hidden /> Habitoo AI
              </Eyebrow>
              <h1 className="mt-6 text-[36px] leading-[1.08] font-semibold tracking-[-0.02em] text-balance text-surface md:text-[44px] xl:text-[56px]">
                CRM imobiliar cu <span className="text-gold-gradient">AI</span> pentru agențiile din România
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-navy-foreground sm:text-lg">
                Introduci proprietatea o dată, o publici pe toate portalurile, iar AI-ul te ajută cu restul: texte, poze și follow-up-uri.
              </p>
              <div className="mt-8 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:flex">
                <Button asChild size="lg" className="h-12 rounded-full bg-gold px-7 text-base text-gold-foreground shadow-raised hover:bg-gold/90">
                  <CrmLink to="/register">Începe gratuit <ArrowRight /></CrmLink>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-navy-foreground/30 bg-transparent px-7 text-base text-navy-foreground hover:bg-surface/10 hover:text-surface">
                  <a href="#cum-functioneaza">Vezi cum funcționează</a>
                </Button>
              </div>
            </div>

            <div className="home-dashboard-stage relative mx-auto w-full max-w-3xl pb-24 sm:pb-16 lg:pb-0">
              <div className="home-dashboard-transform rounded-[28px] border border-gold/30 bg-background/10 p-2 shadow-float backdrop-blur-sm">
                <DashboardMock />
              </div>
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-2 sm:translate-x-0 lg:-right-6 lg:-bottom-10">
                <AiTypingPanel />
              </div>
            </div>
          </Container>
        </section>

        <section className="relative z-10 -mt-8 pb-12 sm:pb-16">
          <Container>
            <ul className="grid overflow-hidden rounded-[28px] border border-gold/20 bg-card shadow-float sm:grid-cols-3">
              {trust.map((item) => (
                <li key={item.label} className="flex min-h-20 items-center gap-3 border-b border-border p-5 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gold-tint text-gold-dark">
                    <item.icon className="size-5" />
                  </span>
                  <span className="text-sm font-bold text-navy">{item.label}</span>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section id="habitoo-ai" className="px-3 py-6 sm:px-6">
          <div className="hp-hero-bg relative mx-auto max-w-7xl overflow-hidden rounded-[36px] px-5 py-16 text-navy-foreground sm:px-10 lg:py-24">
            <div aria-hidden className="home-glow home-glow-two" />
            <div className="relative">
              <SectionHeading
                tone="light"
                eyebrow={<Eyebrow tone="gold"><Sparkles className="size-3.5" aria-hidden /> Habitoo AI</Eyebrow>}
                title={<>AI-ul lucrează pentru agent, <span className="text-gold">agentul decide.</span></>}
                text="Funcții AI incluse în Habitoo, gândite pentru munca de zi cu zi a agenției."
              />
              <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {AI_CARDS.map((card, index) => (
                  <Reveal key={card.title} delay={index * 50} className={card.wide ? "lg:col-span-2" : undefined}>
                    <article className="hp-card-dark">
                      <span className="grid size-12 place-items-center rounded-2xl bg-gold/15 text-gold">
                        <card.icon className="size-5" />
                      </span>
                      <h3 className="mt-5 text-xl text-surface">{card.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-navy-foreground">{card.text}</p>
                    </article>
                  </Reveal>
                ))}
              </div>
              <p className="mx-auto mt-10 flex max-w-2xl items-start justify-center gap-2 text-center text-base font-semibold text-surface">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
                AI-ul propune, tu aprobi. Nimic nu se trimite fără acordul tău.
              </p>
            </div>
          </div>
        </section>

        <Section id="functionalitati" className="pt-16">
          <Container>
            <SectionHeading eyebrow="Funcționalități" title={<>Tot ce folosește agenția, <span className="text-gold">într-un singur loc</span></>} text="Instrumentele zilnice lucrează împreună, fără pași complicați." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {HOME_FEATURES.map((feature, index) => (
                <Reveal key={feature.title} delay={index * 40} className={feature.wide ? "sm:col-span-2" : undefined}>
                  <article className="hp-card">
                    <span className="grid size-12 place-items-center rounded-2xl bg-gold-tint text-gold-dark">
                      <feature.icon className="size-5" />
                    </span>
                    <h3 className="mt-5 text-xl text-navy">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.text}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </Container>
        </Section>

        <IntegratedPortalsSection dynamic={dynamic} />

        <Section id="cum-functioneaza" tone="muted" className="relative overflow-hidden">
          <Container>
            <SectionHeading eyebrow="Cum funcționează" title={<>Trei pași, cu <span className="text-gold">AI</span> alături</>} text="Începi simplu și păstrezi totul la îndemână." />
            <ol className="relative mt-14 grid gap-5 lg:grid-cols-3">
              {HOME_STEPS.map(([title, text], index) => (
                <li key={title}>
                  <Reveal delay={index * 70} className="h-full">
                    <div className="hp-card text-center">
                      <span className="mx-auto grid size-16 place-items-center rounded-full border border-gold/30 bg-background text-3xl font-semibold text-gold shadow-soft">{index + 1}</span>
                      <h3 className="mt-5 text-xl text-navy">{title}</h3>
                      <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{text}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </Container>
        </Section>

        <HomePricingSection />
        <FaqSection items={HOME_FAQ} />

        <section className="px-3 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-28">
          <div className="hp-hero-bg relative mx-auto max-w-7xl overflow-hidden rounded-[36px] px-6 py-16 text-center shadow-float sm:px-12 lg:py-24">
            <div aria-hidden className="home-grid pointer-events-none absolute inset-0 opacity-30" />
            <div aria-hidden className="home-glow home-glow-two" />
            <div className="relative mx-auto max-w-3xl">
              <span className="mx-auto mb-8 inline-flex items-center justify-center rounded-[22px] border border-gold/40 bg-background px-5 py-3 shadow-soft">
                <BrandLogo fullIdentity className="h-10 w-auto lg:h-12" />
              </span>
              <h2 className="text-3xl text-surface sm:text-5xl">Gata să-ți organizezi <span className="text-gold">agenția?</span></h2>
              <p className="mx-auto mt-5 max-w-xl text-base text-navy-foreground sm:text-lg">Începe cu echipa ta, cu Habitoo AI inclus, și păstrează fiecare oportunitate aproape.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full bg-gold px-7 text-base text-gold-foreground hover:bg-gold/90">
                  <CrmLink to="/register">Începe gratuit <ArrowRight /></CrmLink>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-navy-foreground/30 bg-transparent px-7 text-base text-navy-foreground hover:bg-surface/10 hover:text-surface">
                  <CrmLink to="/login">Autentificare</CrmLink>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
      <CookieConsent />
    </div>
  );
}
