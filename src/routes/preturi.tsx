import { publicPagePhotos, publicPhotoHead } from "@/components/marketing/public-page-photos";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, MessageCircle, Users } from "lucide-react";
import { useState } from "react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { LaunchOfferBadge } from "@/components/marketing/LaunchOfferBadge";
import { FaqSection, faqPageJsonLd, type FaqItem } from "@/components/marketing/FaqSection";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { pageJsonLd, planOffersJsonLd } from "@/components/marketing/structured-data";
import { publicHead } from "@/components/marketing/public-head";
import { PLAN_AGENT_LIMITS, PLAN_LABELS, PLAN_PRICES, type PlanKey } from "@/lib/plans";
import { cn } from "@/lib/utils";

const TITLE = "Prețuri CRM imobiliar: planuri Basic, Pro, Unlimited";
const DESCRIPTION =
  "Planurile Habitoo CRM: Basic 10€, Pro 40€ și Unlimited 100€ pe lună, cu 50% reducere la plata anuală. Alege planul potrivit pentru agenția ta imobiliară.";


export const Route = createFileRoute("/preturi")({
  head: () =>
    publicHead({
      ...publicPhotoHead(publicPagePhotos.pricing),
      path: "/preturi",
      title: TITLE,
      description: DESCRIPTION,
      jsonLd: [
        ...pageJsonLd({ path: "/preturi", name: "Prețuri", description: DESCRIPTION }),
        planOffersJsonLd(),
        faqPageJsonLd(faq),
      ],
    }),
  component: PricingPage,
});

const plans = [
  {
    key: "basic" as PlanKey,
    audience:
      "Pentru agenții mici sau agenți independenți care vor ordine în portofoliu și în clienți.",
    highlights: [
      "Publicare pe portalurile imobiliare",
      "Colaborare între agenții",
      "Suport prin tichete în aplicație",
    ],
    featured: false,
  },
  {
    key: "pro" as PlanKey,
    audience:
      "Pentru echipe care lucrează zilnic în CRM și au nevoie de pipeline, obiective și rapoarte.",
    highlights: [
      "Toate portalurile activate pentru agenție",
      "Colaborare și comisioane partajate",
      "Suport prioritar",
    ],
    featured: true,
  },
  {
    key: "unlimited" as PlanKey,
    audience: "Pentru agenții cu mai multe birouri și echipe care cresc fără plafon de locuri.",
    highlights: [
      "Portaluri și feeduri fără restricții",
      "Colaborare la nivel de rețea",
      "Suport dedicat la implementare",
    ],
    featured: false,
  },
];


const included = [
  "Proprietăți cu media manager, statusuri, filtre și vederi salvate",
  "Contacte 360° și cereri structurate",
  "Pipeline de lead-uri cu istoric complet",
  "Matching automat cerere ↔ proprietate",
  "Activități, calendar și notificări",
  "Dashboard pe rol, obiective și rapoarte",
  "Echipă, roluri și date izolate per agenție",
  "Căutare globală și adăugare rapidă",
];

const faq: FaqItem[] = [
  {
    q: "Cum funcționează perioada gratuită?",
    a: "Orice agenție nouă primește 90 de zile de acces gratuit, fără card bancar, indiferent de planul ales. La final, plătești planul dorit pentru a continua.",
  },
  {
    q: "Cum funcționează reducerea la plata anuală?",
    a: "La plata anuală tariful lunar este cu 50% mai mic, dar factura se emite o singură dată, pentru 12 luni: 60 €/an pentru Basic, 240 €/an pentru Pro și 600 €/an pentru Unlimited.",
  },

  {
    q: "Ce înseamnă limita de agenți?",
    a: "Basic include 3 agenți activi, Pro include 10, iar Unlimited nu are nicio limită de agenți. Poți schimba planul oricând, iar locurile se recalculează imediat.",
  },
  {
    q: "Pot plăti online din aplicație?",
    a: "Nu încă. Planul se activează de echipa Habitoo după ce trimiți cererea de cont, iar plata se face prin factură.",
  },
  {
    q: "Pot crea agenția și testa aplicația acum?",
    a: "Da. Trimiți cererea de înscriere a agenției, iar după validare îți poți invita colegii și poți adăuga proprietăți, contacte, cereri și lead-uri.",
  },
  {
    q: "Datele agenției mele sunt separate de ale altor agenții?",
    a: "Da. Fiecare agenție are propriul spațiu de lucru, iar accesul este controlat prin roluri (administrator de agenție și agent). Utilizatorii văd doar datele agenției din care fac parte.",
  },
];


const includedAi = [
  "Completare automată a fișei din text, poze și istoric",
  "Corectarea titlului și a descrierii",
  "Reordonarea pozelor și alegerea copertei",
  "AI Marketing, Studio AI și Agentul AI CRM",
];

type Cycle = "monthly" | "annual";

/** Un card de plan; perioada vine din comutatorul comun al paginii. */
function PlanCard({ plan: p, cycle }: { plan: (typeof plans)[number]; cycle: Cycle }) {
  const price = PLAN_PRICES[p.key];
  const monthly = cycle === "annual" ? price.annualMonthly : price.monthly;

  return (
    <div
      className={cn(
        "ds-card relative flex h-full flex-col p-7",
        p.featured && "border-[color:var(--ds-cyan)] bg-[linear-gradient(180deg,rgba(91,228,255,0.07),rgba(11,18,32,0.75))] shadow-[0_30px_90px_-40px_rgba(91,228,255,0.45)]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl">{PLAN_LABELS[p.key]}</h2>
        {p.featured ? (
          <span className="rounded-full bg-[color:var(--ds-cyan)] px-2.5 py-1 font-mono text-[10px] font-medium tracking-wider text-[#04131A] uppercase">Recomandat</span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-relaxed ds-text-2">{p.audience}</p>
      <p className="mt-8 flex items-baseline gap-1.5 font-display text-5xl font-bold tracking-[-0.04em]">
        {monthly} €
        <span className="font-sans text-base font-normal tracking-normal ds-text-2">/lună</span>
      </p>
      <p className="mt-3 font-mono text-xs ds-text-3">
        {cycle === "annual"
          ? `Facturat anual, ${price.annualMonthly * 12}€/an (în loc de ${price.monthly}€/lună)`
          : "Facturat lunar"}
      </p>
      <p className="mt-6 flex items-center gap-2.5 rounded-xl border border-border bg-[color:rgba(5,8,15,0.6)] px-4 py-3 text-[15px] font-semibold">
        <Users className="size-4 ds-ai" aria-hidden />
        {p.key === "unlimited" ? "Agenți fără limită" : `Până la ${PLAN_AGENT_LIMITS[p.key]} agenți`}
      </p>
      <ul className="mt-5 space-y-2.5">
        {[...p.highlights, "Habitoo AI inclus"].map((h) => (
          <li key={h} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 ds-ai" aria-hidden />
            {h}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-1 flex-col justify-end gap-2">
        <Link to="/register" className={cn("ds-btn h-12", p.featured ? "ds-btn-ai" : "ds-btn-ghost")}>
          Cere un cont <ArrowRight className="size-4" />
        </Link>
        <p className="text-center text-xs ds-text-3">90 de zile gratuit, fără card bancar</p>
        <Link to="/contact" search={{ interes: "preturi" }} className="ds-btn h-10 text-sm ds-text-2 hover:text-foreground">
          <MessageCircle className="size-4" /> Vorbește cu noi
        </Link>
      </div>
    </div>
  );
}

function PricingPage() {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  return (
    <PublicLayout>
      <section className="relative">
        <Container className="relative flex flex-col items-center py-16 text-center sm:py-20 lg:py-24">
          <LaunchOfferBadge className="mb-7" />
          <SectionHeading
            as="h1"
            title={<>Un preț pe agenție. <span className="ds-ai">AI-ul e inclus.</span></>}
            text="Alege plata lunară sau anuală. La plata anuală tariful lunar scade cu 50%, iar factura se emite o singură dată pentru 12 luni. Toate planurile încep cu 90 de zile gratuite."
            className="[&_[data-public-answer]]:mx-auto [&_[data-public-answer]]:text-left"
          />
          <div role="group" aria-label="Perioada de plată" className="mt-9 inline-flex items-center gap-1 rounded-[14px] border border-border bg-[color:rgba(11,18,32,0.7)] p-1">
            {(["monthly", "annual"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                onClick={() => setCycle(c)}
                className={cn(
                  "min-h-11 rounded-[10px] px-5 text-sm font-semibold transition-colors",
                  cycle === c ? "bg-[color:var(--ds-cyan)] text-[#04131A]" : "ds-text-2 hover:text-foreground",
                )}
              >
                {c === "monthly" ? "Lunar" : "Anual · -50%"}
              </button>
            ))}
          </div>
        </Container>
      </section>

      <Section className="pt-0 sm:pt-0 lg:pt-0">
        <Container>
          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((p, i) => (
              <Reveal key={p.key} delay={i * 70} className="h-full">
                <PlanCard plan={p} cycle={cycle} />
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-0 sm:pt-0 lg:pt-0">
        <Container className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              align="left"
              eyebrow="Inclus în toate planurile"
              title="Toate planurile includ modulele de bază ale CRM-ului"
              text="Diferențele dintre planuri țin de dimensiunea echipei, de nevoile de configurare și de suport, nu de funcționalitățile esențiale."
            />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
            {[...includedAi.map((t) => ["AI", t] as const), ...included.map((t) => ["CRM", t] as const)].map(([tag, item]) => (
              <li
                key={item}
                className={cn("flex items-start gap-3 rounded-[14px] border p-4 text-sm", tag === "AI" ? "border-[color:rgba(91,228,255,0.3)] bg-[color:rgba(91,228,255,0.04)]" : "border-border bg-[color:rgba(11,18,32,0.6)]")}
              >
                <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px]", tag === "AI" ? "border-[color:rgba(91,228,255,0.4)] ds-ai" : "border-border ds-text-3")}>{tag}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section className="pt-0 sm:pt-0 lg:pt-0">
        <Container className="max-w-3xl text-center">
          <p className="text-base text-muted-foreground">
            Plătești acum pe agent?{" "}
            <Link to="/comparatie/cost-crm-pe-agentie-vs-pe-agent" className="font-medium text-primary underline-offset-4 hover:underline">Calculează diferența față de prețul pe agenție</Link>.
          </p>
        </Container>
      </Section>

      <FaqSection items={faq} title="Întrebări despre prețuri" />

      <CtaBand
        title="Hai să găsim împreună planul potrivit pentru agenția ta."
        text="Îți prezentăm platforma pe un scenariu apropiat de activitatea ta și discutăm despre echipă, volum și nevoile de configurare."
        primaryLabel="Creează agenția"
        secondaryLabel="Solicită o demonstrație"
      />
    </PublicLayout>
  );
}
