import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ClipboardList,
  History,
  Kanban,
  LayoutDashboard,
  ListChecks,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Eyebrow, Section, SectionHeading } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { DashboardMock } from "@/components/marketing/mockups/DashboardMock";
import { PropertyMatchesMock, RequestMatchesMock } from "@/components/marketing/mockups/MatchingMock";
import {
  ActivitiesMini,
  CalendarMini,
  ContactsMini,
  GoalsMini,
  MediaMini,
  NotificationsMini,
  RequestsMini,
  TeamMini,
} from "@/components/marketing/mockups/MiniMocks";
import { PipelineMock } from "@/components/marketing/mockups/PipelineMock";
import { PropertiesMock } from "@/components/marketing/mockups/PropertiesMock";
import { ReportsMock } from "@/components/marketing/mockups/ReportsMock";
import { cn } from "@/lib/utils";

const TITLE = "Funcționalități — Habitoo CRM imobiliar";
const DESCRIPTION =
  "Toate modulele Habitoo CRM: proprietăți cu media manager, contacte 360°, cereri, pipeline de lead-uri, matching automat, activități, calendar, obiective, dashboard și rapoarte.";

export const Route = createFileRoute("/functionalitati")({
  head: () =>
    publicHead({
      path: "/functionalitati",
      title: TITLE,
      description: DESCRIPTION,
    }),
  component: FeaturesPage,
});

type Module = {
  id: string;
  icon: LucideIcon;
  name: string;
  headline: string;
  text: string;
  bullets: string[];
  mock: ReactNode;
  wide?: boolean;
};

const modules: Module[] = [
  {
    id: "proprietati",
    icon: Building2,
    name: "Proprietăți",
    headline: "Portofoliul agenției, complet și mereu la zi",
    text: "Fișă detaliată pentru fiecare proprietate: tip, tranzacție, preț, suprafață, camere, etaj, an, zonă, facilități, descriere și proprietar.",
    bullets: [
      "Galerie foto cu încărcare, reordonare și fotografie principală",
      "Statusuri: draft, activ, rezervat, în negociere, vândut, închiriat, expirat, arhivat",
      "Căutare, filtre, sortare, vederi salvate, favorite și arhivare",
      "Activități și vizionări programate direct din proprietate",
    ],
    mock: <PropertiesMock />,
    wide: true,
  },
  {
    id: "contacte",
    icon: Users,
    name: "Contacte",
    headline: "Fiecare client, cu tot contextul lui",
    text: "Proprietari, cumpărători, chiriași, investitori sau parteneri, cu istoricul complet al relației într-un singur loc.",
    bullets: [
      "Fișă 360°: cereri, lead-uri, proprietăți deținute, activități și note",
      "Tipuri de contact și surse pentru segmentare",
      "Legături directe către cereri și lead-uri",
    ],
    mock: <ContactsMini />,
  },
  {
    id: "cereri",
    icon: ClipboardList,
    name: "Cereri",
    headline: "Ce caută clientul, exprimat în criterii clare",
    text: "Cumpărare, închiriere sau investiție, cu buget, zone, camere, suprafață și tip de proprietate. Criteriile alimentează direct matching-ul.",
    bullets: [
      "Criterii structurate, nu note libere",
      "Potriviri calculate live pentru fiecare cerere",
      "Legătură cu contactul și cu lead-urile generate",
    ],
    mock: <RequestsMini />,
  },
  {
    id: "lead-uri",
    icon: Kanban,
    name: "Lead-uri",
    headline: "Pipeline vizual, de la Nou la Câștigat",
    text: "Nouă etape clare, mutare prin drag & drop și un istoric care păstrează fiecare schimbare, notă și activitate.",
    bullets: [
      "Kanban cu drag & drop și listă cu filtre",
      "Etape: Nou, Contactat, Calificat, Vizionare, Ofertă, Negociere, Tranzacție, Câștigat, Pierdut",
      "Istoric complet al lead-ului și atribuire pe agent",
      "Legături cu contact, cerere și proprietate",
    ],
    mock: <PipelineMock />,
    wide: true,
  },
  {
    id: "matching",
    icon: Sparkles,
    name: "Matching",
    headline: "Potriviri automate, în ambele sensuri",
    text: "Pentru o cerere vezi proprietățile potrivite; pentru o proprietate vezi clienții care o caută. Fiecare scor vine cu motivele lui.",
    bullets: [
      "Criterii: tranzacție, buget, oraș și zonă, camere, suprafață, tip, facilități",
      "Scor și motive explicate pentru fiecare potrivire",
      "Recalculat automat la fiecare actualizare",
    ],
    mock: (
      <div className="grid gap-4">
        <RequestMatchesMock />
        <PropertyMatchesMock className="hidden xl:block" />
      </div>
    ),
  },
  {
    id: "activitati",
    icon: ListChecks,
    name: "Activități",
    headline: "Tot ce ai de făcut, legat de client și proprietate",
    text: "Apeluri, întâlniri, vizionări, task-uri, emailuri, follow-up-uri și note, cu termen, responsabil și stare.",
    bullets: [
      "Centru de activități cu filtre pe tip și stare",
      "Creare rapidă din proprietate, contact sau lead",
      "Marchezi ca finalizat și rămâne în istoric",
    ],
    mock: <ActivitiesMini />,
  },
  {
    id: "calendar",
    icon: CalendarDays,
    name: "Calendar",
    headline: "Vizionările și întâlnirile echipei, într-o singură agendă",
    text: "Calendarul arată activitățile programate pe zile și săptămâni, pentru agent sau pentru toată agenția.",
    bullets: [
      "Vedere zilnică și săptămânală",
      "Vizionări programate din proprietate sau lead",
      "Agenda de azi direct pe dashboard",
    ],
    mock: <CalendarMini />,
  },
  {
    id: "obiective",
    icon: Target,
    name: "Obiective",
    headline: "Ținte clare pentru fiecare agent",
    text: "Obiective lunare pentru lead-uri, vizionări, proprietăți noi, tranzacții sau comision, cu progres vizibil.",
    bullets: [
      "Obiective pe agent și pe agenție",
      "Progres calculat din activitatea reală",
      "Vizibile pe dashboard și în rapoarte",
    ],
    mock: <GoalsMini />,
  },
  {
    id: "dashboard",
    icon: LayoutDashboard,
    name: "Dashboard",
    headline: "Un ecran de start diferit pentru fiecare rol",
    text: "Agentul își vede agenda, lead-urile și obiectivele; administratorul vede întreaga agenție și activitatea echipei.",
    bullets: [
      "Indicatori: proprietăți active, lead-uri noi, cereri, vizionări",
      "Agenda de azi și pipeline-ul pe scurt",
      "Adăugare rapidă și căutare globală din orice ecran",
    ],
    mock: <DashboardMock />,
    wide: true,
  },
  {
    id: "rapoarte",
    icon: BarChart3,
    name: "Rapoarte",
    headline: "Cifrele agenției, fără export manual",
    text: "Rapoarte despre portofoliu, lead-uri și activitate, pentru decizii bazate pe date reale.",
    bullets: [
      "Proprietăți pe status și pe tip",
      "Surse de lead-uri și funnel pe etape",
      "Activitatea și obiectivele agenților",
    ],
    mock: <ReportsMock />,
    wide: true,
  },
];

const platform = [
  {
    icon: ShieldCheck,
    title: "Echipă și roluri",
    text: "Admin de agenție și agenți, cu permisiuni diferite. Fiecare agenție își vede doar propriile date.",
  },
  {
    icon: Bell,
    title: "Notificări",
    text: "Lead-uri atribuite, vizionări confirmate și actualizări importante, direct în aplicație.",
  },
  {
    icon: Search,
    title: "Căutare globală",
    text: "Găsești proprietăți, contacte, cereri și lead-uri dintr-un singur câmp de căutare.",
  },
  {
    icon: History,
    title: "Jurnal de audit",
    text: "Modificările importante rămân înregistrate: cine, ce și când a schimbat.",
  },
];

function FeaturesPage() {
  return (
    <PublicLayout>
      <section className="mk-hero-bg relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="mk-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(60%_60%_at_50%_0%,black,transparent)]"
        />
        <Container className="relative py-16 sm:py-20 lg:py-24">
          <SectionHeading
            as="h1"
            eyebrow="Funcționalități"
            title="Toate modulele de care are nevoie o agenție imobiliară, într-un singur CRM"
            text="Fiecare modul funcționează împreună cu celelalte: proprietățile alimentează matching-ul, cererile generează lead-uri, iar activitățile apar în calendar și în rapoarte."
          />
          <nav aria-label="Module" className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2">
            {modules.map((m) => (
              <a
                key={m.id}
                href={`#${m.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <m.icon className="size-4 text-primary" /> {m.name}
              </a>
            ))}
          </nav>
        </Container>
      </section>

      {modules.map((m, i) => (
        <Section key={m.id} id={m.id} tone={i % 2 === 1 ? "muted" : "default"} className="py-14 sm:py-16 lg:py-20">
          <Container
            className={cn(
              "grid items-center gap-10 lg:grid-cols-12",
            )}
          >
            <div
              className={cn(
                m.wide ? "lg:col-span-5" : "lg:col-span-6",
                i % 2 === 1 && "lg:order-2",
              )}
            >
              <Eyebrow>
                <m.icon className="size-3.5" /> {m.name}
              </Eyebrow>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-balance text-navy sm:text-3xl">
                {m.headline}
              </h2>
              <p className="mt-4 text-base text-pretty text-muted-foreground">{m.text}</p>
              <ul className="mt-6 space-y-2.5">
                {m.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Reveal
              className={cn(
                m.wide ? "lg:col-span-7" : "lg:col-span-6",
                i % 2 === 1 && "lg:order-1",
              )}
            >
              {m.mock}
            </Reveal>
          </Container>
        </Section>
      ))}

      <Section tone="navy">
        <Container>
          <SectionHeading
            tone="light"
            eyebrow="Platformă"
            title="Baza pe care lucrează toate modulele"
            text="Securitate, roluri și trasabilitate sunt parte din produs, nu opțiuni suplimentare."
          />
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {platform.map((p, i) => (
              <li key={p.title}>
                <Reveal delay={i * 60} className="h-full">
                  <div className="h-full rounded-2xl border border-navy-foreground/10 bg-navy-foreground/5 p-5">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-gold/20 text-gold">
                      <p.icon className="size-5" />
                    </span>
                    <h3 className="mt-4 font-sans text-sm font-semibold text-navy-foreground">{p.title}</h3>
                    <p className="mt-2 text-sm text-navy-muted">{p.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <MediaMini />
            <TeamMini />
            <NotificationsMini />
          </div>
          <div className="mt-10 text-center">
            <Button asChild variant="link" className="text-navy-foreground">
              <Link to="/despre">
                Află mai multe despre platformă <ArrowRight />
              </Link>
            </Button>
          </div>
        </Container>
      </Section>

      <CtaBand
        title="Vezi modulele în acțiune, pe datele agenției tale."
        text="Creează agenția, invită echipa și adaugă primele proprietăți și cereri. Sau programează o demonstrație ghidată."
      />
    </PublicLayout>
  );
}
