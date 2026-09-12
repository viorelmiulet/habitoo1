import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { CtaBand } from "@/components/marketing/CtaBand";
import { navyButton } from "@/components/marketing/PublicHeader";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { PLAN_AGENT_LIMITS, PLAN_LABELS, PLAN_PRICES, type PlanKey } from "@/lib/plans";
import { cn } from "@/lib/utils";

const TITLE = "Prețuri și planuri — Habitoo CRM";
const DESCRIPTION =
  "Planurile Habitoo CRM: Basic 10€, Pro 20€ și Unlimited 100€ pe lună, cu 50% reducere la plata anuală. Alege planul potrivit pentru agenția ta imobiliară.";


export const Route = createFileRoute("/preturi")({
  head: () =>
    publicHead({
      path: "/preturi",
      title: TITLE,
      description: DESCRIPTION,
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

const faq = [
  {
    q: "Cum funcționează reducerea la plata anuală?",
    a: "La plata anuală tariful lunar este cu 50% mai mic, dar factura se emite o singură dată, pentru 12 luni: 60€/an pentru Basic, 120€/an pentru Pro și 600€/an pentru Unlimited.",
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


function PricingPage() {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

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
            eyebrow="Prețuri"
            title="Trei planuri simple, cu prețuri clare"
            text="Alege plata lunară sau anuală. La plata anuală tariful lunar scade cu 50%, iar factura se emite o singură dată pentru 12 luni."
          />
        </Container>
      </section>

      <Section className="pt-12 sm:pt-16">
        <Container>
          {/* Comutator Lunar / Anual: prețurile din carduri se schimbă împreună cu el. */}
          <div className="mx-auto mb-10 flex w-fit items-center gap-1 rounded-full border border-border bg-card p-1 shadow-soft">
            {(["monthly", "annual"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                onClick={() => setCycle(c)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  cycle === c
                    ? "bg-navy text-navy-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c === "monthly" ? "Lunar" : "Anual · -50%"}
              </button>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((p, i) => {
              const price = PLAN_PRICES[p.key];
              const monthly = cycle === "annual" ? price.annualMonthly : price.monthly;
              return (
                <Reveal key={p.key} delay={i * 70} className="h-full">
                  <div
                    className={cn(
                      "relative flex h-full flex-col rounded-3xl border p-7",
                      p.featured
                        ? "mk-navy-bg border-navy shadow-float"
                        : "border-border bg-card shadow-soft",
                    )}
                  >
                    {p.featured ? (
                      <span className="absolute -top-3 left-7 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground">
                        Recomandat
                      </span>
                    ) : null}
                    <h2
                      className={cn(
                        "text-xl font-semibold",
                        p.featured ? "text-navy-foreground" : "text-navy",
                      )}
                    >
                      {PLAN_LABELS[p.key]}
                    </h2>
                    <p
                      className={cn(
                        "mt-2 text-sm",
                        p.featured ? "text-navy-muted" : "text-muted-foreground",
                      )}
                    >
                      {p.audience}
                    </p>
                    <p
                      className={cn(
                        "mt-6 flex items-baseline gap-1.5 text-4xl font-semibold tracking-tight",
                        p.featured ? "text-navy-foreground" : "text-navy",
                      )}
                    >
                      {monthly}€
                      <span
                        className={cn(
                          "text-base font-medium",
                          p.featured ? "text-navy-muted" : "text-muted-foreground",
                        )}
                      >
                        /lună
                      </span>
                    </p>
                    <p
                      className={cn(
                        "mt-1.5 text-sm",
                        p.featured ? "text-navy-muted" : "text-muted-foreground",
                      )}
                    >
                      {cycle === "annual"
                        ? `Facturat anual, ${price.annualMonthly * 12}€/an (în loc de ${price.monthly}€/lună)`
                        : "Facturat lunar"}
                    </p>
                    <p
                      className={cn(
                        "mt-5 text-sm font-medium",
                        p.featured ? "text-navy-foreground" : "text-foreground",
                      )}
                    >
                      {p.key === "unlimited"
                        ? "Agenți fără limită"
                        : `Până la ${PLAN_AGENT_LIMITS[p.key]} agenți`}
                    </p>
                    <ul className="mt-4 space-y-2.5">
                      {p.highlights.map((h) => (
                        <li
                          key={h}
                          className={cn(
                            "flex items-start gap-2.5 text-sm",
                            p.featured ? "text-navy-foreground" : "text-foreground",
                          )}
                        >
                          <Check
                            className={cn(
                              "mt-0.5 size-4 shrink-0",
                              p.featured ? "text-gold" : "text-success",
                            )}
                          />
                          {h}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-8 flex flex-1 flex-col justify-end gap-2">
                      <Button
                        asChild
                        className={cn(
                          "h-11",
                          p.featured ? "bg-gold text-gold-foreground hover:bg-gold/90" : navyButton,
                        )}
                      >
                        <Link to="/register">
                          Cere un cont <ArrowRight />
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        className={cn(
                          "h-10",
                          p.featured &&
                            "text-navy-foreground hover:bg-navy-foreground/10 hover:text-navy-foreground",
                        )}
                      >
                        <Link to="/contact" search={{ interes: "preturi" }}>
                          <MessageCircle /> Vorbește cu noi
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

        </Container>
      </Section>

      <Section tone="muted">
        <Container className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              align="left"
              eyebrow="Inclus"
              title="Toate planurile includ modulele de bază ale CRM-ului"
              text="Diferențele dintre planuri țin de dimensiunea echipei, de nevoile de configurare și de suport, nu de funcționalitățile esențiale."
            />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
            {included.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-3xl">
          <SectionHeading
            eyebrow="Întrebări frecvente"
            title="Ce ne întreabă de obicei agențiile"
          />
          <Accordion type="single" collapsible className="mt-10">
            {faq.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-base font-semibold text-navy">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-base text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Container>
      </Section>

      <CtaBand
        title="Hai să găsim împreună planul potrivit pentru agenția ta."
        text="Îți prezentăm platforma pe un scenariu apropiat de activitatea ta și discutăm despre echipă, volum și nevoile de configurare."
        primaryLabel="Creează agenția"
        secondaryLabel="Solicită o demonstrație"
      />
    </PublicLayout>
  );
}
