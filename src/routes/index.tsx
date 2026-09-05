import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  Eye,
  History,
  Images,
  Kanban,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CtaBand } from "@/components/marketing/CtaBand";
import { navyButton } from "@/components/marketing/PublicHeader";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Eyebrow, Section, SectionHeading } from "@/components/marketing/Section";
import { publicHead, SITE_URL } from "@/components/marketing/public-head";
import { DashboardMock } from "@/components/marketing/mockups/DashboardMock";
import { PropertyMatchesMock, RequestMatchesMock } from "@/components/marketing/mockups/MatchingMock";
import { PipelineMock } from "@/components/marketing/mockups/PipelineMock";
import { PropertiesMock } from "@/components/marketing/mockups/PropertiesMock";
import { ReportsMock } from "@/components/marketing/mockups/ReportsMock";
import { ScoreRing } from "@/components/marketing/mockups/ScoreRing";

const TITLE = "Habitoo CRM — CRM imobiliar pentru agenții din România";
const DESCRIPTION =
  "Habitoo CRM organizează proprietățile, clienții, cererile și lead-urile agenției tale, cu matching automat, pipeline vizual, calendar și rapoarte. Creează agenția în câteva minute.";

export const Route = createFileRoute("/")({
  head: () =>
    publicHead({
      path: "/",
      title: TITLE,
      description: DESCRIPTION,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Habitoo CRM",
          url: SITE_URL,
          logo: `${SITE_URL}/favicon.png`,
        },
        {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Habitoo CRM",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          inLanguage: "ro",
          url: SITE_URL,
          description: DESCRIPTION,
        },
      ],
    }),
  component: HomePage,
});

const valueStrip = [
  {
    icon: Building2,
    title: "Proprietăți",
    text: "Portofoliu complet, cu galerie foto, status și vederi salvate.",
  },
  {
    icon: Users,
    title: "Clienți și cereri",
    text: "Fișă 360° pentru fiecare contact, cu cereri structurate pe criterii.",
  },
  {
    icon: Kanban,
    title: "Lead-uri",
    text: "Pipeline vizual în 9 etape, cu istoric pentru fiecare mutare.",
  },
  {
    icon: Sparkles,
    title: "Matching automat",
    text: "Scor și motive clare pentru fiecare potrivire cerere ↔ proprietate.",
  },
];

const flow = [
  { icon: Building2, title: "Proprietate", text: "Adaugi proprietatea cu date, fotografii și status." },
  { icon: Users, title: "Client", text: "Creezi contactul: proprietar, cumpărător, chiriaș." },
  { icon: ClipboardList, title: "Cerere", text: "Notezi criteriile: buget, zonă, camere, suprafață." },
  { icon: Sparkles, title: "Matching", text: "Vezi imediat potrivirile cu scor și motive." },
  { icon: Kanban, title: "Lead", text: "Urmărești oportunitatea prin etapele pipeline-ului." },
  { icon: CalendarDays, title: "Vizionare", text: "Programezi vizionarea direct din proprietate sau lead." },
  { icon: TrendingUp, title: "Tranzacție", text: "Închizi și vezi rezultatul în obiective și rapoarte." },
];

const benefits = [
  {
    icon: Clock,
    title: "Mai puțin timp pierdut",
    text: "Adăugare rapidă, căutare globală și agendă zilnică. Agentul găsește în câteva secunde proprietatea, clientul sau lead-ul de care are nevoie.",
  },
  {
    icon: Building2,
    title: "Mai mult control asupra portofoliului",
    text: "Statusuri clare (activ, rezervat, în negociere, vândut, închiriat), filtre, vederi salvate și favorite. Nimic nu rămâne uitat sau expirat.",
  },
  {
    icon: Eye,
    title: "Vizibilitate asupra lead-urilor",
    text: "Fiecare oportunitate are o etapă, un responsabil și un istoric complet. Știi exact unde s-a blocat și ce urmează.",
  },
  {
    icon: BarChart3,
    title: "Decizii mai bune din date",
    text: "Dashboard pe rol, obiective pe agent și rapoarte despre portofoliu, surse de lead-uri și activitate.",
  },
];

const extras = [
  { icon: Users, label: "Contacte 360°" },
  { icon: ClipboardList, label: "Cereri structurate" },
  { icon: CalendarDays, label: "Activități și calendar" },
  { icon: Target, label: "Obiective pe agent" },
  { icon: Bell, label: "Notificări" },
  { icon: ShieldCheck, label: "Echipă și roluri" },
  { icon: Search, label: "Căutare globală" },
  { icon: History, label: "Jurnal de audit" },
];

function HomePage() {
  return (
    <PublicLayout>
      {/* HERO */}
      <section className="mk-hero-bg relative overflow-hidden">
        <div
          aria-hidden
          className="mk-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
        />
        <Container className="relative grid gap-12 py-16 sm:py-20 lg:grid-cols-12 lg:items-center lg:gap-10 lg:py-28">
          <div className="lg:col-span-5">
            <Eyebrow tone="gold">CRM imobiliar pentru agenții din România</Eyebrow>
            <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-navy sm:text-5xl lg:text-[3.35rem]">
              Transformă cererile și proprietățile în{" "}
              <span className="text-gold-gradient">tranzacții închise</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
              Habitoo CRM ține portofoliul, clienții, cererile și lead-urile agenției tale într-un
              singur sistem, cu matching automat, agendă și rapoarte, ca nimic să nu se piardă între
              etape.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className={`${navyButton} h-12 px-7 text-base`}>
                <Link to="/register">
                  Începe acum <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base">
                <a href="#flux">Vezi cum funcționează</a>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["Fără instalare", "Roluri pentru admin și agenți", "Date izolate per agenție"].map(
                (t) => (
                  <li key={t} className="inline-flex items-center gap-2">
                    <Check className="size-4 text-success" /> {t}
                  </li>
                ),
              )}
            </ul>
          </div>

          <div className="relative lg:col-span-7">
            <DashboardMock />
            <div className="pointer-events-none absolute -top-5 -right-2 hidden w-64 rounded-2xl border border-border bg-card p-3 shadow-float md:block lg:-right-6">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ArrowRightLeft className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">Lead mutat: Contactat → Calificat</p>
                  <p className="text-[11px] text-muted-foreground">Salvat automat în istoric</p>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-6 -left-2 hidden w-72 rounded-2xl border border-border bg-card p-3 shadow-float md:block lg:-left-8">
              <div className="flex items-center gap-3">
                <ScoreRing score={92} size={46} />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-wide text-gold uppercase">
                    Potrivire nouă
                  </p>
                  <p className="truncate text-xs font-semibold">Apartament 3 camere, Aviației</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Cerere Mihai Ionescu · buget, zonă, camere
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* VALUE STRIP */}
      <section className="border-y border-border bg-card">
        <Container>
          <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {valueStrip.map((v, i) => (
              <li key={v.title} className="py-6 sm:px-6 sm:py-8 first:sm:pl-0 last:sm:pr-0">
                <Reveal delay={i * 60}>
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-navy text-navy-foreground">
                      <v.icon className="size-5" />
                    </span>
                    <div>
                      <h2 className="font-sans text-sm font-semibold text-navy">{v.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{v.text}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* FLOW */}
      <Section id="flux" tone="muted">
        <Container>
          <SectionHeading
            eyebrow="Totul într-un singur loc"
            title="De la prima proprietate la tranzacția închisă, fără foi de calcul și mesaje pierdute"
            text="Fiecare pas al muncii de agent are locul lui în Habitoo CRM, iar informația circulă natural între module."
          />
          <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-7 lg:gap-3">
            {flow.map((step, i) => (
              <li key={step.title} className="relative">
                <Reveal delay={i * 50} className="h-full">
                  <div className="panel flex h-full flex-col p-4">
                    <div className="flex items-center justify-between">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <step.icon className="size-4.5" />
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                        0{i + 1}
                      </span>
                    </div>
                    <h3 className="mt-4 font-sans text-sm font-semibold text-navy">{step.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.text}</p>
                  </div>
                </Reveal>
                {i < flow.length - 1 ? (
                  <ArrowRight
                    aria-hidden
                    className="absolute top-1/2 -right-3 hidden size-4 -translate-y-1/2 text-border lg:block"
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* PROPERTIES */}
      <Section id="proprietati">
        <Container className="grid items-center gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              align="left"
              eyebrow="Proprietăți"
              title="Un portofoliu pe care îl controlezi, nu doar îl păstrezi"
              text="Fiecare proprietate are fișa ei completă: preț, suprafață, camere, zonă, caracteristici, status și galerie foto gestionată din aplicație."
            />
            <ul className="mt-8 space-y-4">
              {[
                {
                  icon: Images,
                  title: "Media manager",
                  text: "Încarci fotografii, le reordonezi prin tragere și alegi imaginea principală.",
                },
                {
                  icon: ClipboardList,
                  title: "Date complete și statusuri clare",
                  text: "Activ, rezervat, în negociere, vândut, închiriat, expirat sau arhivat, cu istoric în audit.",
                },
                {
                  icon: Search,
                  title: "Filtre, sortare și vederi salvate",
                  text: "Găsești rapid ce cauți și salvezi filtrele pe care le folosești zilnic. Favorite pentru proprietățile importante.",
                },
              ].map((b) => (
                <li key={b.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold/12 text-gold">
                    <b.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-sans text-sm font-semibold text-navy">{b.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <Reveal className="lg:col-span-7">
            <PropertiesMock />
          </Reveal>
        </Container>
      </Section>

      {/* LEADS */}
      <Section id="lead-uri" tone="muted">
        <Container className="grid items-center gap-12 lg:grid-cols-12">
          <Reveal className="order-2 lg:order-1 lg:col-span-7">
            <PipelineMock />
          </Reveal>
          <div className="order-1 lg:order-2 lg:col-span-5">
            <SectionHeading
              align="left"
              eyebrow="Lead-uri"
              title="Un pipeline vizual în care nimic nu se pierde între etape"
              text="Fiecare oportunitate trece prin etape clare, de la Nou până la Câștigat, iar echipa vede în orice moment unde se află."
            />
            <ul className="mt-8 space-y-4">
              {[
                {
                  icon: Kanban,
                  title: "Kanban cu drag & drop",
                  text: "Muți lead-ul dintr-o etapă în alta cu o singură mișcare; schimbarea se salvează instant.",
                },
                {
                  icon: History,
                  title: "Istoric complet",
                  text: "Fiecare schimbare de etapă, notă, apel sau vizionare rămâne în cronologia lead-ului.",
                },
                {
                  icon: Users,
                  title: "Legat de contact, cerere și proprietate",
                  text: "Lead-ul știe cine este clientul, ce caută și ce proprietate îl interesează.",
                },
              ].map((b) => (
                <li key={b.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <b.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-sans text-sm font-semibold text-navy">{b.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      {/* MATCHING */}
      <Section id="matching" tone="navy">
        <Container>
          <SectionHeading
            tone="light"
            eyebrow="Matching automat"
            title="Potriviri în ambele sensuri, cu scor și motive explicate"
            text="Pentru fiecare cerere vezi proprietățile potrivite, iar pentru fiecare proprietate vezi clienții care o caută. Scorul se calculează live, din criteriile deja introduse."
          />
          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <Reveal>
              <RequestMatchesMock />
            </Reveal>
            <Reveal delay={80}>
              <PropertyMatchesMock />
            </Reveal>
          </div>
          <ul className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                title: "Criterii reale",
                text: "Tip tranzacție, buget, oraș și zonă, număr de camere, suprafață, tip de proprietate și facilități.",
              },
              {
                title: "Motive, nu doar un număr",
                text: "Fiecare potrivire arată ce criterii sunt îndeplinite și ce lipsește, ca să știi ce propui clientului.",
              },
              {
                title: "Mereu la zi",
                text: "Când actualizezi o cerere sau o proprietate, potrivirile se recalculează automat.",
              },
            ].map((f, i) => (
              <li key={f.title}>
                <Reveal delay={i * 60}>
                  <div className="rounded-2xl border border-navy-foreground/10 bg-navy-foreground/5 p-5">
                    <h3 className="font-sans text-sm font-semibold text-navy-foreground">{f.title}</h3>
                    <p className="mt-2 text-sm text-navy-muted">{f.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-center text-xs text-navy-muted">
            Datele și scorurile afișate sunt demonstrative.
          </p>
        </Container>
      </Section>

      {/* DASHBOARD & REPORTS */}
      <Section id="rapoarte">
        <Container className="grid items-center gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              align="left"
              eyebrow="Dashboard și rapoarte"
              title="Vezi cum merge agenția, nu doar ce s-a întâmplat"
              text="Fiecare rol are propriul dashboard: agentul își vede agenda și obiectivele, administratorul vede întreaga agenție."
            />
            <ul className="mt-8 space-y-4">
              {[
                {
                  icon: BarChart3,
                  title: "Rapoarte pe portofoliu și lead-uri",
                  text: "Proprietăți pe status, surse de lead-uri, funnel pe etape și activitatea agenților.",
                },
                {
                  icon: Target,
                  title: "Obiective pe agent",
                  text: "Ținte lunare pentru lead-uri, vizionări, proprietăți noi, tranzacții sau comision, cu progres vizibil.",
                },
                {
                  icon: CalendarDays,
                  title: "Agenda de azi, într-un singur ecran",
                  text: "Apeluri, vizionări, follow-up-uri și task-uri, direct din dashboard și din calendar.",
                },
              ].map((b) => (
                <li key={b.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold/12 text-gold">
                    <b.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-sans text-sm font-semibold text-navy">{b.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <Reveal className="lg:col-span-7">
            <ReportsMock />
          </Reveal>
        </Container>
      </Section>

      {/* BENEFITS */}
      <Section tone="muted">
        <Container>
          <SectionHeading
            eyebrow="De ce Habitoo CRM"
            title="Construit pentru felul în care lucrează o agenție imobiliară"
            text="Nu un CRM generic adaptat, ci un sistem gândit din start pentru proprietăți, clienți, cereri și vizionări."
          />
          <ul className="mt-14 grid gap-5 sm:grid-cols-2">
            {benefits.map((b, i) => (
              <li key={b.title}>
                <Reveal delay={i * 60} className="h-full">
                  <div className="panel flex h-full gap-5 p-6">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-navy text-navy-foreground">
                      <b.icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-navy">{b.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.text}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>

          <div className="mt-14 rounded-3xl border border-border bg-card p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-md">
                <h3 className="text-xl font-semibold text-navy">Și tot ce mai are nevoie o echipă</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Module care lucrează împreună cu proprietățile și lead-urile, nu pe lângă ele.
                </p>
                <Button asChild variant="link" className="mt-3 h-auto px-0 text-primary">
                  <Link to="/functionalitati">
                    Vezi toate funcționalitățile <ArrowRight />
                  </Link>
                </Button>
              </div>
              <ul className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                {extras.map((e) => (
                  <li
                    key={e.label}
                    className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-medium text-foreground"
                  >
                    <e.icon className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{e.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      <CtaBand />
    </PublicLayout>
  );
}
