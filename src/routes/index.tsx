import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CircleCheck,
  ClipboardList,
  Kanban,
  Link2,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CookieConsent } from "@/components/marketing/CookieConsent";
import { CrmLink } from "@/components/marketing/CrmLink";
import { FaqSection, faqPageJsonLd, type FaqItem } from "@/components/marketing/FaqSection";
import { HomeHeader } from "@/components/marketing/HomeHeader";
import { HomePricingSection } from "@/components/marketing/HomePricingSection";
import { PublicFooter } from "@/components/marketing/PublicFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Eyebrow, Section, SectionHeading } from "@/components/marketing/Section";
import { DashboardMock } from "@/components/marketing/mockups/DashboardMock";
import { homeIdentityJsonLd } from "@/components/marketing/structured-data";
import { publicHead } from "@/components/marketing/public-head";
import { getCurrentHostname } from "@/lib/current-host";
import { isCrmHostname } from "@/lib/host";

const TITLE = "Habitoo CRM — CRM imobiliar pentru agenții din România";
const DESCRIPTION =
  "Habitoo CRM organizează proprietățile, clienții, cererile și lead-urile agenției tale, cu matching automat, pipeline vizual, calendar și rapoarte. Creează agenția în câteva minute.";

const faq: FaqItem[] = [
  {
    q: "Ce este Habitoo CRM?",
    a: "Habitoo CRM este un CRM imobiliar pentru agențiile din România. Ține într-un singur loc proprietățile, clienții, cererile și lead-urile, face automat potrivirea între cereri și proprietăți și publică anunțurile pe portalurile imobiliare direct din aplicație.",
  },
  {
    q: "Ce este un CRM imobiliar și de ce are nevoie o agenție de el?",
    a: "Un CRM imobiliar este un program în care agenția își gestionează portofoliul, clienții și tranzacțiile. Fără el, informația stă în telefoane, foi de calcul și conversații separate, iar oportunitățile se pierd între agenți. Cu un CRM, fiecare cerere, vizionare și ofertă rămâne înregistrată și vizibilă pentru echipă.",
  },
  {
    q: "Pe ce portaluri imobiliare pot publica anunțurile din Habitoo?",
    a: "Din Habitoo poți publica pe Imobiliare.ro, Storia și OLX, Publi24 (prin Romimo), iMove, Imospot, HomePitch, PrimulAnunț, OferteImobiliare, LaCheie și ClickImob, iar internațional pe Properstar. Alegi pentru fiecare anunț pe ce portaluri apare. Modificările se trimit când apeși „Publică”, iar portalurile care preiau anunțurile prin feed le actualizează la următoarea sincronizare. Poți trimite anunțurile și în Catalogul Facebook (Meta), pentru reclame și afișare în Facebook și Instagram, alegând pe fiecare anunț dacă intră în catalog.",
  },
  {
    q: "Cum funcționează potrivirea automată dintre cereri și proprietăți?",
    a: "Habitoo compară criteriile fiecărei cereri (tip de tranzacție, buget, oraș și zonă, număr de camere, suprafață, tip de proprietate și facilități) cu proprietățile din portofoliu și calculează un scor. Fiecare potrivire vine cu motivele ei, iar lista se actualizează automat când se schimbă o cerere sau o proprietate.",
  },
  {
    q: "Pot aduce în Habitoo proprietățile dintr-un alt CRM?",
    a: "Da. Habitoo are infrastructura necesară pentru import din orice CRM imobiliar, inclusiv fotografiile. Proprietățile tale ajung în Habitoo fără să le introduci din nou de mână.",
  },
  {
    q: "Cât costă Habitoo CRM?",
    a: "Habitoo are trei planuri: Basic la 10 €/lună, pentru până la 3 agenți; Pro la 40 €/lună, pentru până la 10 agenți; Unlimited la 100 €/lună, fără limită de agenți. La plata anuală prețul lunar scade cu 50%. Toate planurile încep cu 30 de zile gratuite, fără card bancar.",
  },
  {
    q: "Pot testa Habitoo gratuit?",
    a: "Da. Orice agenție poate folosi Habitoo gratuit 30 de zile, fără card bancar. Îți creezi agenția, inviți colegii și adaugi proprietăți, iar la final alegi planul potrivit.",
  },
  {
    q: "Datele agenției mele sunt separate de ale altor agenții?",
    a: "Da. Fiecare agenție are propriul spațiu de lucru, iar utilizatorii văd doar datele agenției lor, în funcție de rol: administratorul vede toată agenția, iar agentul vede ce i-a fost atribuit. Modificările importante rămân înregistrate într-un jurnal de audit.",
  },
  {
    q: "Pot colabora cu alte agenții din Habitoo?",
    a: "Da. Habitoo are un modul de colaborare de tip MLS: o agenție marchează proprietăți ca disponibile pentru colaborare, cu un comision stabilit, iar celelalte agenții din Habitoo le pot propune propriilor clienți. Discuția despre fiecare propunere are loc direct în aplicație.",
  },
  {
    q: "Există aplicație mobilă pentru Habitoo?",
    a: "Aplicația mobilă Habitoo pentru iOS și Android va fi disponibilă în curând. Până atunci, Habitoo funcționează în browser pe telefon, tabletă și calculator, fără instalare.",
  },
];

const trustItems = [
  { icon: Link2, label: "Portaluri integrate" },
  { icon: Sparkles, label: "Matching automat" },
  { icon: ShieldCheck, label: "Date separate pe agenții" },
  { icon: Users, label: "Echipă cu roluri" },
];

type HomeFeature = {
  icon: LucideIcon;
  title: string;
  text: string;
  wide?: boolean;
  visual?: "properties" | "matching";
};

const features: HomeFeature[] = [
  {
    icon: Building2,
    title: "Proprietăți",
    text: "Portofoliul tău rămâne complet, ordonat și ușor de găsit.",
    wide: true,
    visual: "properties",
  },
  {
    icon: Sparkles,
    title: "Matching automat",
    text: "Vezi rapid ce proprietăți se potrivesc fiecărei cereri.",
    wide: true,
    visual: "matching",
  },
  {
    icon: Users,
    title: "Clienți și cereri",
    text: "Păstrezi contactele și criteriile lor în același loc.",
  },
  {
    icon: Kanban,
    title: "Lead-uri",
    text: "Urmărești fiecare oportunitate până la tranzacția închisă.",
  },
  {
    icon: Link2,
    title: "Publicare pe portaluri",
    text: "Alegi unde apare fiecare anunț, direct din fișa lui.",
  },
  {
    icon: BarChart3,
    title: "Rapoarte",
    text: "Înțelegi portofoliul, activitatea și rezultatele agenției.",
  },
];

const steps = [
  ["Adaugi proprietățile", "Completezi datele și fotografiile o singură dată."],
  ["Primești cererile și lead-urile", "Echipa vede imediat ce are de urmărit."],
  ["Închizi tranzacția", "Păstrezi istoricul clar până la rezultatul final."],
] as const;

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (isCrmHostname(getCurrentHostname())) throw redirect({ to: "/app" });
  },
  head: () =>
    publicHead({
      path: "/",
      title: TITLE,
      description: DESCRIPTION,
      jsonLd: [...homeIdentityJsonLd(DESCRIPTION), faqPageJsonLd(faq)],
    }),
  component: HomePage,
});

function FeatureVisual({ type }: { type?: "properties" | "matching" }) {
  if (type === "matching") {
    return (
      <div className="mt-8 flex items-center gap-5 rounded-2xl border border-gold/20 bg-gold-tint/60 p-4">
        <div className="grid size-20 shrink-0 place-items-center rounded-full border-8 border-gold bg-card text-xl font-bold text-navy">
          92%
        </div>
        <div className="min-w-0 space-y-2">
          <div className="h-2 w-32 max-w-full rounded-full bg-gold" />
          <div className="h-2 w-24 max-w-full rounded-full bg-gold/50" />
          <p className="text-xs font-semibold text-gold-dark">Potrivire foarte bună</p>
        </div>
      </div>
    );
  }
  if (type === "properties") {
    return (
      <div className="mt-8 grid grid-cols-3 gap-2" aria-hidden>
        {["Activ", "Vizionare", "Ofertă"].map((label, index) => (
          <div key={label} className="rounded-2xl border border-border bg-background p-3">
            <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
            <div className="mt-3 h-2 rounded-full bg-gold/20">
              <div className={index === 0 ? "h-full w-5/6 rounded-full bg-gold" : index === 1 ? "h-full w-2/3 rounded-full bg-gold" : "h-full w-1/2 rounded-full bg-gold"} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function HomePage() {
  return (
    <div className="mk-root min-h-screen overflow-x-hidden bg-background text-foreground">
      <a href="#continut" className="sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:not-sr-only focus:rounded-full focus:bg-background focus:px-4 focus:py-2">
        Sari la conținut
      </a>
      <HomeHeader />
      <main id="continut">
        <section className="home-hero relative overflow-hidden bg-navy pt-[88px] text-navy-foreground lg:pt-[104px]">
          <div aria-hidden className="home-grid pointer-events-none absolute inset-0 opacity-50" />
          <div aria-hidden className="home-glow home-glow-one" />
          <div aria-hidden className="home-glow home-glow-two" />
          <Container className="relative grid min-h-[760px] items-center gap-14 pb-20 pt-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16 lg:pb-28 lg:pt-12">
            <div className="max-w-2xl">
              <Eyebrow tone="light" className="border-gold/30 bg-gold/10 text-gold">
                CRM imobiliar pentru agenții din România
              </Eyebrow>
              <h1 className="mt-6 text-[2.6rem] leading-[1.05] font-semibold text-balance text-surface sm:text-6xl lg:text-[4.4rem]">
                Transformă cererile și proprietățile în <span className="text-gold">tranzacții închise.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-navy-foreground sm:text-lg">
                Anunțuri, clienți și lead-uri într-un singur loc, simplu de folosit de prima zi.
              </p>
              <div className="mt-7 grid grid-cols-2 gap-2 sm:mt-9 sm:flex sm:gap-3">
                <Button asChild size="lg" className="h-12 rounded-full px-3 text-sm shadow-raised sm:px-7 sm:text-base">
                  <CrmLink to="/register">Începe acum <ArrowRight /></CrmLink>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-navy-foreground/30 bg-transparent px-3 text-sm text-navy-foreground hover:bg-surface/10 hover:text-surface sm:px-7 sm:text-base">
                  <a href="#cum-functioneaza">Vezi cum funcționează</a>
                </Button>
              </div>
              <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
                {["Fără instalare", "Roluri pentru admin și agenți", "Datele agenției rămân separate"].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-navy-foreground">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-gold" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="home-dashboard-stage relative mx-auto w-full max-w-3xl pb-8 lg:pb-0">
              <div className="home-dashboard-transform rounded-[28px] border border-gold/30 bg-background/10 p-2 shadow-float backdrop-blur-sm">
                <DashboardMock />
              </div>
              <div className="home-float home-float-one">
                <Kanban className="size-4 text-gold" />
                <span>Lead mutat în Calificat</span>
              </div>
              <div className="home-float home-float-two">
                <Sparkles className="size-4 text-gold" />
                <span>Potrivire 92%</span>
              </div>
              <div className="home-float home-float-three">
                <Check className="size-4 text-success" />
                <span>Vizionare confirmată</span>
              </div>
            </div>
          </Container>
        </section>

        <section className="relative z-10 -mt-6 pb-12 sm:-mt-9 sm:pb-16">
          <Container>
            <ul className="grid overflow-hidden rounded-[28px] border border-gold/20 bg-card shadow-float sm:grid-cols-2 lg:grid-cols-4">
              {trustItems.map((item) => (
                <li key={item.label} className="flex min-h-24 items-center gap-3 border-b border-border p-5 last:border-b-0 sm:[&:nth-child(3)]:border-b-0 lg:border-r lg:border-b-0 lg:last:border-r-0">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gold-tint text-gold-dark">
                    <item.icon className="size-5" />
                  </span>
                  <span className="text-sm font-bold text-navy">{item.label}</span>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <Section id="functionalitati" className="pt-12 sm:pt-16">
          <Container>
            <SectionHeading eyebrow="Tot ce contează" title={<>Munca agenției, mai <span className="text-gold">clară</span></>} text="Instrumentele zilnice lucrează împreună, fără pași complicați." />
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              {features.map((feature, index) => (
                <Reveal key={feature.title} delay={index * 45} className={feature.wide ? "lg:row-span-2" : undefined}>
                  <article className={feature.wide ? "home-bento-card min-h-[360px]" : "home-bento-card min-h-[220px]"}>
                    <span className="grid size-12 place-items-center rounded-2xl bg-gold-tint text-gold-dark">
                      <feature.icon className="size-5" />
                    </span>
                    <h3 className="mt-6 text-2xl text-navy">{feature.title}</h3>
                    <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">{feature.text}</p>
                    <FeatureVisual type={feature.visual} />
                  </article>
                </Reveal>
              ))}
            </div>
          </Container>
        </Section>

        <Section id="cum-functioneaza" tone="muted" className="relative overflow-hidden">
          <Container>
            <SectionHeading eyebrow="Cum funcționează" title={<>Trei pași spre mai multă <span className="text-gold">ordine</span></>} text="Începi simplu și păstrezi totul la îndemână." />
            <ol className="relative mt-14 grid gap-8 lg:grid-cols-3 lg:gap-12">
              <div aria-hidden className="absolute top-11 right-[16%] left-[16%] hidden border-t-2 border-dashed border-gold/40 lg:block" />
              {steps.map(([title, text], index) => (
                <li key={title} className="relative z-10 text-center">
                  <Reveal delay={index * 70}>
                    <span className="mx-auto grid size-22 place-items-center rounded-full border border-gold/30 bg-background text-4xl font-semibold text-gold shadow-soft">{index + 1}</span>
                    <h3 className="mt-6 text-xl text-navy">{title}</h3>
                    <p className="mx-auto mt-3 max-w-xs text-base text-muted-foreground">{text}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </Container>
        </Section>

        <HomePricingSection />
        <FaqSection items={faq} />

        <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-28">
          <div className="home-final-cta relative mx-auto max-w-7xl overflow-hidden rounded-[32px] bg-navy px-6 py-16 text-center shadow-float sm:px-12 lg:py-24">
            <div aria-hidden className="home-grid pointer-events-none absolute inset-0 opacity-30" />
            <div aria-hidden className="home-glow home-glow-two" />
            <div className="relative mx-auto max-w-3xl">
              <span className="mx-auto mb-8 inline-flex items-center justify-center rounded-[22px] border border-gold/40 bg-background px-5 py-3 shadow-soft">
                <BrandLogo fullIdentity className="h-10 w-auto lg:h-12" />
              </span>
              <h2 className="text-3xl text-surface sm:text-5xl">Gata să-ți organizezi <span className="text-gold">agenția?</span></h2>
              <p className="mx-auto mt-5 max-w-xl text-base text-navy-foreground sm:text-lg">Începe cu echipa ta și păstrează fiecare oportunitate aproape.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
                  <CrmLink to="/register">Creează agenția <ArrowRight /></CrmLink>
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