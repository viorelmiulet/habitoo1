import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Play, ShieldCheck } from "lucide-react";
import markDark from "@/assets/brand/habitoo-mark-dark.png.asset.json";
import { CookieConsent } from "@/components/marketing/CookieConsent";
import { CrmLink } from "@/components/marketing/CrmLink";
import { FaqSection } from "@/components/marketing/FaqSection";
import { IntegratedPortalsSection } from "@/components/marketing/IntegratedPortalsSection";
import { HomeHeader } from "@/components/marketing/HomeHeader";
import { HomePricingSection } from "@/components/marketing/HomePricingSection";
import { PublicFooter } from "@/components/marketing/PublicFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Eyebrow, Section } from "@/components/marketing/Section";
import { AI_CARDS, HOME_EXTENSION, HOME_FAQ, HOME_FEATURES, HOME_STEPS } from "./home-content";
import { CHROME_EXTENSION_PATH, CHROME_EXTENSION_URL } from "@/components/marketing/chrome-extension-content";
import { portalsLabel, publicPortalCount } from "@/lib/portals/integration-pages";
import type { PortalDefinition } from "@/lib/portals/registry";

/** Consola AI din hero: ilustrație statică, fără funcționalitate. */
function AiConsole() {
  const steps: [string, string][] = [
    ["Câmpuri completate din text și poze", "19 câmpuri"],
    ["Lift și dotări deduse din istoricul adresei", "din istoric"],
    ["Titlu și descriere corectate", "majuscule · punctuație"],
    ["Poze reordonate, coperta aleasă", "14 poze"],
  ];
  return (
    <div aria-hidden className="ds-panel overflow-hidden border-[color:rgba(91,228,255,0.28)] shadow-[0_40px_120px_-40px_rgba(91,228,255,0.25)]">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-[color:var(--ds-line-strong)]" /><i className="size-2.5 rounded-full bg-[color:var(--ds-line-strong)]" /><i className="size-2.5 rounded-full bg-[color:var(--ds-line-strong)]" /></span>
        <span className="truncate font-mono text-xs ds-text-3">crm.habitoo.ro / proprietăți / nouă</span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-xs ds-ai"><span className="ds-live-dot" /> Agent AI</span>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="ml-auto max-w-[92%] rounded-2xl border border-border bg-[color:rgba(30,44,78,0.55)] px-4 py-3 text-[15px] leading-relaxed">
          Completează fișa din anunț și pregătește-l pentru Imobiliare.ro și Storia.<span className="ds-cursor ml-1" />
        </p>
        <div className="ds-card p-4">
          <p className="font-mono text-[11px] tracking-[0.12em] ds-ai uppercase">✦ Habitoo AI · rulare</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            {steps.map(([label, meta]) => (
              <li key={label} className="flex items-center gap-3">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[color:rgba(91,228,255,0.14)] ds-ai"><Check className="size-3" /></span>
                <span className="min-w-0 flex-1">{label}</span>
                <span className="hidden font-mono text-[11px] ds-text-3 sm:inline">{meta}</span>
              </li>
            ))}
            <li className="flex items-center gap-3">
              <span className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-[color:var(--ds-cyan)]"><span className="size-1.5 rounded-full bg-[color:var(--ds-cyan)]" /></span>
              <span className="min-w-0 flex-1">Pregătire pentru Imobiliare.ro și Storia</span>
              <span className="hidden font-mono text-[11px] ds-text-3 sm:inline">aștept aprobarea</span>
            </li>
          </ul>
          <div className="ds-scanline mt-4" />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr]">
          <div className="rounded-2xl border border-[color:rgba(224,178,92,0.35)] bg-[color:rgba(224,178,92,0.05)] p-4">
            <p className="font-mono text-[11px] tracking-[0.12em] text-gold uppercase">Previzualizare anunț</p>
            <p className="mt-1.5 font-display text-base font-semibold">Apartament 3 camere, 78 mp, lângă metrou</p>
            <p className="mt-1 text-xs ds-text-2">Etaj 4/8 · lift · parcare inclusă</p>
          </div>
          <div className="grid gap-2">
            <span className="ds-btn ds-btn-ai">Aprobă și publică</span>
            <span className="ds-btn ds-btn-ghost">Revizuiește</span>
          </div>
        </div>
        <p className="font-mono text-[11px] ds-text-3">AI-ul propune, tu aprobi. Nimic nu se trimite fără acordul tău.</p>
      </div>
    </div>
  );
}

export function HomeContent({ dynamic }: { dynamic: PortalDefinition[] }) {
  const portalCount = publicPortalCount(dynamic);
  const facts = [
    { value: String(portalCount), label: "portaluri integrate" },
    { value: "90 zile", label: "gratuit, fără card bancar" },
    { value: "1 click", label: "preluare cu Habitoo Catch" },
    { value: "100%", label: "date izolate per agenție" },
  ];
  return (
    <div className="mk-root min-h-screen overflow-x-hidden">
      <a href="#continut" className="sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:not-sr-only focus:rounded-lg focus:bg-background focus:px-4 focus:py-2">
        Sari la conținut
      </a>
      <HomeHeader />
      <main id="continut">
        <section className="relative pt-[88px] lg:pt-[104px]">
          <Container className="grid items-center gap-12 pb-20 pt-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-28 lg:pt-14">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ds-line-strong)] bg-[color:rgba(11,18,32,0.6)] px-3.5 py-1.5 font-mono text-xs ds-text-2">
                <span className="ds-live-dot" /> Habitoo AI · agentul tău lucrează acum
              </span>
              <h1 className="mt-7 text-[40px] leading-[1.04] text-balance sm:text-[52px] xl:text-[68px]">
                CRM-ul imobiliar <span className="ds-ai">full AI.</span> Tu decizi. AI-ul execută.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed ds-text-2 sm:text-lg">
                Introduci proprietatea o dată. AI-ul completează fișa din text, poze și istoricul agenției, corectează anunțul, alege cea mai bună copertă și îl pregătește pentru {portalsLabel(portalCount)}. Tu doar aprobi.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <CrmLink to="/register" className="ds-btn ds-btn-primary h-12 px-6">Începe gratuit 90 de zile <ArrowRight className="size-4" /></CrmLink>
                <a href="#habitoo-ai" className="ds-btn ds-btn-ghost h-12 px-6"><Play className="size-4" /> Vezi AI-ul în acțiune</a>
              </div>
              <p className="mt-6 font-mono text-xs leading-relaxed ds-text-3">
                Fără card bancar · Habitoo AI inclus în toate planurile · Date izolate per agenție
              </p>
            </div>
            <AiConsole />
          </Container>
        </section>

        <section aria-label="Pe scurt" className="border-y border-border bg-[color:rgba(11,18,32,0.55)]">
          <Container>
            <ul className="grid grid-cols-2 gap-y-8 py-10 lg:grid-cols-4">
              {facts.map((f) => (
                <li key={f.label}>
                  <p className="font-display text-4xl font-bold tracking-[-0.03em] sm:text-[44px]">{f.value}</p>
                  <p className="mt-2 font-mono text-xs ds-text-3">{f.label}</p>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <Section id="habitoo-ai">
          <Container>
            <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
              <div>
                <Eyebrow>Habitoo AI</Eyebrow>
                <h2 className="mt-4 text-3xl text-balance sm:text-5xl">AI-ul lucrează pentru agent, agentul decide.</h2>
              </div>
              <p className="text-base leading-relaxed ds-text-2 sm:text-lg">Funcții AI incluse în Habitoo, gândite pentru munca de zi cu zi a agenției.</p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {AI_CARDS.map((card, index) => (
                <Reveal key={card.title} delay={index * 40} className="h-full">
                  <article className="ds-card h-full p-6">
                    <div className="flex items-start justify-between">
                      <span className="grid size-11 place-items-center rounded-xl border border-[color:rgba(91,228,255,0.3)] bg-[color:rgba(91,228,255,0.06)] ds-ai">
                        <card.icon className="size-5" aria-hidden />
                      </span>
                      <span className="font-mono text-[11px] ds-text-3">AI·{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <h3 className="mt-5 text-lg">{card.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed ds-text-2">{card.text}</p>
                  </article>
                </Reveal>
              ))}
            </div>
            <p className="mt-6 flex items-start gap-3 rounded-[20px] border border-[color:rgba(91,228,255,0.25)] bg-[color:rgba(91,228,255,0.04)] px-5 py-4 text-[15px]">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 ds-ai" aria-hidden />
              <span><strong>AI-ul propune, tu aprobi.</strong> Nimic nu se trimite fără acordul tău.</span>
            </p>
          </Container>
        </Section>

        <Section id="cum-functioneaza" className="pt-0 sm:pt-0 lg:pt-0">
          <Container>
            <Eyebrow>Flux</Eyebrow>
            <h2 className="mt-4 max-w-3xl text-3xl text-balance sm:text-5xl">De la anunț la tranzacție, în patru pași.</h2>
            <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {HOME_STEPS.map(([title, text], index) => (
                <li key={title} className="relative">
                  <div className="flex items-center">
                    <span className="grid size-14 shrink-0 place-items-center rounded-full border border-[color:rgba(91,228,255,0.35)] bg-background font-mono text-sm ds-ai">{String(index + 1).padStart(2, "0")}</span>
                    <span aria-hidden className={`hidden h-px flex-1 lg:block ${index === HOME_STEPS.length - 1 ? "bg-gradient-to-r from-[color:rgba(224,178,92,0.6)] to-transparent" : "bg-gradient-to-r from-[color:rgba(91,228,255,0.5)] to-[color:rgba(91,228,255,0.2)]"}`} />
                  </div>
                  <h3 className="mt-6 text-xl">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed ds-text-2">{text}</p>
                </li>
              ))}
            </ol>
          </Container>
        </Section>

        <Section id="functionalitati" className="pt-0 sm:pt-0 lg:pt-0">
          <Container>
            <Eyebrow className="text-gold">Platforma</Eyebrow>
            <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <h2 className="max-w-3xl text-3xl text-balance sm:text-5xl">Tot ce folosește agenția, într-un singur loc.</h2>
              <Link to="/functionalitati" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-gold">Toate funcționalitățile <ArrowRight className="size-4" /></Link>
            </div>
            <ul className="mt-12 grid overflow-hidden rounded-[24px] border border-border sm:grid-cols-2 lg:grid-cols-4">
              {HOME_FEATURES.map((feature, index) => (
                <li key={feature.title} className="border-b border-border p-6 sm:border-r [&:nth-child(2n)]:sm:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(4n)]:border-r-0">
                  <p className="font-mono text-[11px] ds-text-3">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-4 text-lg">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed ds-text-2">{feature.text}</p>
                </li>
              ))}
            </ul>
          </Container>
        </Section>

        <IntegratedPortalsSection dynamic={dynamic} />

        <section id="habitoo-catch" className="py-12 sm:py-16">
          <Container>
            <div className="grid items-center gap-10 rounded-[28px] border border-[color:rgba(224,178,92,0.3)] bg-gradient-to-br from-[color:rgba(224,178,92,0.07)] to-transparent p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:p-12">
              <div>
                <Eyebrow className="text-gold">Extensie Chrome</Eyebrow>
                <h2 className="mt-4 text-3xl text-balance sm:text-4xl">{HOME_EXTENSION.title}</h2>
                <p className="mt-4 text-base leading-relaxed ds-text-2">{HOME_EXTENSION.description}</p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <a href={CHROME_EXTENSION_URL} target="_blank" rel="noopener noreferrer" className="ds-btn ds-btn-primary">Adaugă în Chrome <ArrowRight className="size-4" /></a>
                  <a href={CHROME_EXTENSION_PATH} className="ds-btn ds-btn-ghost border-[color:rgba(224,178,92,0.4)]">Află mai multe</a>
                </div>
              </div>
              <div className="ds-card p-5">
                <div className="flex items-center gap-2.5">
                  <img src={markDark.url} alt="" width={24} height={23} loading="lazy" className="h-6 w-auto" />
                  <span className="font-display font-semibold">Habitoo Catch</span>
                </div>
                <ul className="mt-4 space-y-3">
                  {HOME_EXTENSION.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-3 text-sm">
                      <Check className="size-4 shrink-0 ds-ai" aria-hidden /> {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Container>
        </section>

        <HomePricingSection />
        <FaqSection items={HOME_FAQ} />

        <section className="pb-16 sm:pb-20 lg:pb-28">
          <Container>
            <div className="ds-panel relative overflow-hidden px-6 py-16 text-center sm:px-12 lg:py-20">
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_60%_at_50%_30%,rgba(91,228,255,0.1),transparent_70%)]" />
              <div className="relative mx-auto max-w-3xl">
                <img src={markDark.url} alt="" width={64} height={62} loading="lazy" className="mx-auto mb-8 h-16 w-auto" />
                <h2 className="text-3xl text-balance sm:text-5xl">Gata să-ți organizezi agenția?</h2>
                <p className="mx-auto mt-5 max-w-xl text-base ds-text-2 sm:text-lg">Începe cu echipa ta, cu Habitoo AI inclus, și păstrează fiecare oportunitate aproape.</p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <CrmLink to="/register" className="ds-btn ds-btn-primary h-12 px-6">Începe gratuit <ArrowRight className="size-4" /></CrmLink>
                  <CrmLink to="/login" className="ds-btn ds-btn-ghost h-12 px-6">Autentificare</CrmLink>
                </div>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <PublicFooter />
      <CookieConsent />
    </div>
  );
}
