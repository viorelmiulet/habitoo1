import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
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
import { cn } from "@/lib/utils";

const TITLE = "Prețuri și planuri — Habitoo CRM";
const DESCRIPTION =
  "Planurile Habitoo CRM pentru agenții imobiliare de toate dimensiunile. Prețurile finale se publică la lansarea comercială; până atunci, solicită o demonstrație.";

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
    q: "De ce nu sunt afișate prețurile?",
    a: "Prețurile finale vor fi publicate odată cu lansarea comercială. Până atunci, prezentăm platforma într-o demonstrație și discutăm împreună varianta potrivită pentru agenția ta.",
  },
  {
    q: "Pot crea agenția și testa aplicația acum?",
    a: "Da. Îți poți crea contul și agenția, poți invita colegi și poți adăuga proprietăți, contacte, cereri și lead-uri. Datele rămân în contul tău.",
  },
  {
    q: "Datele agenției mele sunt separate de ale altor agenții?",
    a: "Da. Fiecare agenție are propriul spațiu de lucru, iar accesul este controlat prin roluri (administrator de agenție și agent). Utilizatorii văd doar datele agenției din care fac parte.",
  },
  {
    q: "Există integrare cu portaluri imobiliare sau facturare online?",
    a: "Nu încă. În această etapă, Habitoo CRM se concentrează pe activitatea internă a agenției: portofoliu, clienți, cereri, lead-uri, matching, activități și rapoarte.",
  },
];

function PricingPage() {
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
            title="Planuri gândite pentru agenții de orice dimensiune"
            text="Prețurile finale vor fi publicate la lansarea comercială. Până atunci, îți arătăm platforma într-o demonstrație și îți răspundem la toate întrebările."
          />
        </Container>
      </section>

      <Section className="pt-12 sm:pt-16">
        <Container>
          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((p, i) => (
              <Reveal key={p.name} delay={i * 70} className="h-full">
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
                    {p.name}
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
                      "mt-6 text-3xl font-semibold tracking-tight",
                      p.featured ? "text-navy-foreground" : "text-navy",
                    )}
                  >
                    Preț la cerere
                  </p>
                  <ul className="mt-6 space-y-2.5">
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
                      <Link to="/contact" search={{ interes: "demo" }}>
                        Solicită o demonstrație <ArrowRight />
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
            ))}
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
