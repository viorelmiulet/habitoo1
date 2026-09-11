import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Compass,
  History,
  Languages,
  Layers,
  LockKeyhole,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { PipelineMock } from "@/components/marketing/mockups/PipelineMock";

const TITLE = "Despre Habitoo CRM — platformă pentru agenții imobiliare";
const DESCRIPTION =
  "Habitoo CRM este o platformă construită pentru agențiile imobiliare din România: organizare, automatizare și control asupra portofoliului, clienților și lead-urilor.";

export const Route = createFileRoute("/despre")({
  head: () =>
    publicHead({
      path: "/despre",
      title: TITLE,
      description: DESCRIPTION,
    }),
  component: AboutPage,
});

const pillars = [
  {
    icon: Layers,
    title: "Organizare",
    text: "Proprietăți, clienți, cereri, lead-uri și activități au fiecare locul lor și sunt legate între ele. Informația nu mai stă în telefoane, foi de calcul și conversații separate.",
  },
  {
    icon: Sparkles,
    title: "Automatizare",
    text: "Matching-ul calculează potrivirile din criteriile deja introduse, istoricul lead-ului se scrie singur, iar agenda zilnică se construiește din activitățile programate.",
  },
  {
    icon: Compass,
    title: "Control",
    text: "Dashboard pe rol, obiective pe agent, rapoarte și jurnal de audit. Administratorul vede întreaga agenție, agentul își vede propria activitate.",
  },
];

const steps = [
  {
    icon: Building2,
    title: "Creezi agenția",
    text: "Îți faci contul, configurezi agenția și inviți colegii. Fiecare primește rolul potrivit: administrator sau agent.",
  },
  {
    icon: Workflow,
    title: "Aduci datele de lucru",
    text: "Adaugi proprietățile cu fotografii, contactele și cererile lor. Matching-ul începe să lucreze din prima cerere.",
  },
  {
    icon: Users,
    title: "Echipa lucrează zilnic în CRM",
    text: "Lead-uri în pipeline, vizionări în calendar, activități bifate, obiective urmărite. Rapoartele se construiesc din munca reală.",
  },
];

const trust = [
  {
    icon: LockKeyhole,
    title: "Date separate pentru fiecare agenție",
    text: "Fiecare agenție are propriul spațiu de lucru. Utilizatorii au acces doar la datele agenției din care fac parte, în funcție de rol.",
  },
  {
    icon: History,
    title: "Trasabilitate",
    text: "Modificările importante rămân în jurnalul de audit, iar fiecare lead are un istoric complet al schimbărilor de etapă și al activităților.",
  },
  {
    icon: Languages,
    title: "Construit pentru România",
    text: "Interfață în limba română, tipuri de proprietăți și tranzacții folosite pe piața locală, prețuri în euro sau lei și fluxuri gândite pentru felul în care lucrează agențiile de aici.",
  },
];

function AboutPage() {
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
            eyebrow="Despre Habitoo CRM"
            title="Sistemul de lucru al agenției imobiliare moderne"
            text="Habitoo CRM a pornit de la o observație simplă: agenții pierd tranzacții nu pentru că le lipsesc clienții sau proprietățile, ci pentru că informația despre ele este împrăștiată. Am construit un singur loc în care totul se leagă."
          />
        </Container>
      </section>

      <Section>
        <Container>
          <SectionHeading
            eyebrow="Misiune"
            title="Organizare, automatizare și control pentru echipele imobiliare"
            text="Trei principii care stau în spatele fiecărui modul din Habitoo CRM."
          />
          <ul className="mt-14 grid gap-6 lg:grid-cols-3">
            {pillars.map((p, i) => (
              <li key={p.title}>
                <Reveal delay={i * 70} className="h-full">
                  <div className="panel h-full p-7">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-navy text-navy-foreground">
                      <p.icon className="size-5" />
                    </span>
                    <h3 className="mt-5 text-xl font-semibold text-navy">{p.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section tone="muted">
        <Container className="grid items-center gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              align="left"
              eyebrow="Cum funcționează"
              title="Trei pași până când echipa lucrează într-un singur sistem"
            />
            <ol className="mt-8 space-y-6">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold/12 text-sm font-semibold text-gold">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-sans text-base font-semibold text-navy">{s.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Reveal className="lg:col-span-7">
            <PipelineMock />
          </Reveal>
        </Container>
      </Section>

      <Section tone="navy">
        <Container>
          <SectionHeading
            tone="light"
            eyebrow="Încredere"
            title="Construit cu atenție la date și la responsabilități"
          />
          <ul className="mt-12 grid gap-5 lg:grid-cols-3">
            {trust.map((t, i) => (
              <li key={t.title}>
                <Reveal delay={i * 60} className="h-full">
                  <div className="h-full rounded-2xl border border-navy-foreground/10 bg-navy-foreground/5 p-6">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-gold/20 text-gold">
                      <t.icon className="size-5" />
                    </span>
                    <h3 className="mt-4 font-sans text-base font-semibold text-navy-foreground">
                      {t.title}
                    </h3>
                    <p className="mt-2 text-sm text-navy-muted">{t.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <CtaBand
        title="Vrei să vezi cum ar arăta agenția ta în Habitoo CRM?"
        text="Creează agenția și adaugă primele proprietăți, sau programează o demonstrație în care parcurgem împreună fluxul complet."
      />
    </PublicLayout>
  );
}
