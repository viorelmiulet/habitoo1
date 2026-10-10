import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Rocket, UserPlus } from "lucide-react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Eyebrow, Section, SectionHeading } from "@/components/marketing/Section";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { publicHead } from "@/components/marketing/public-head";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const TITLE = "Întrebări frecvente — Habitoo CRM imobiliar";
const DESCRIPTION =
  "Răspunsuri despre Habitoo CRM: publicarea anunțurilor pe portaluri, chatul dintre agenți și activarea contului de agenție, pas cu pas.";

type Faq = { q: string; a: string };
type FaqGroup = { id: string; icon: typeof Rocket; title: string; faqs: Faq[] };

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "portaluri",
    icon: Rocket,
    title: "Publicarea pe portaluri",
    faqs: [
      {
        q: "Pe ce portaluri pot publica din Habitoo?",
        a: "Din Habitoo poți publica pe Storia, OLX, Imobiliare.ro, Romimo, Publi24, Imospot, VDI.ro, La-Cheie, Oferte-Imobiliare, PrimulAnunt și altele, plus catalogul Facebook. Lista completă, cu modul de funcționare al fiecărui portal, este pe pagina Integrări.",
      },
      {
        q: "Cum public un anunț pe portaluri?",
        a: "Completezi fișa proprietății o singură dată: date, poze, descriere și preț. Apoi, în fila Publicare a proprietății, bifezi portalurile dorite și apeși Publică. Habitoo trimite anunțul spre fiecare portal ales, iar trimiterea continuă chiar dacă închizi pagina.",
      },
      {
        q: "Cine activează portalurile pentru agenție?",
        a: "Fiecare portal se activează separat, din Setări → Portaluri, de către administratorul agenției. Agenții folosesc portalurile activate de administrator; nu își pot activa singuri portaluri noi.",
      },
      {
        q: "Ce se întâmplă când proprietatea se vinde sau se închiriază?",
        a: "Când proprietatea devine Vândută, Închiriată sau Arhivată, anunțul se retrage automat de pe portalurile care permit retragerea, fără să intri în fiecare cont. Pe portalurile cu feed, anunțul dispare la următoarea citire a portalului.",
      },
      {
        q: "Cum aflu dacă un anunț a fost respins de un portal?",
        a: "Primești o notificare în CRM cu motivul respingerii, iar pe cardul portalului din fila Publicare vezi starea exactă. Corectezi problema în fișa proprietății și retrimiți anunțul din același loc.",
      },
      {
        q: "Primesc mesajele clienților de pe portaluri în CRM?",
        a: "Da, pe portalurile care permit asta: Storia, OLX, VDI.ro și Properstar. Mesajele ajung direct în CRM ca lead-uri, la agentul responsabil de proprietate, ca să nu se piardă nicio cerere.",
      },
    ],
  },
  {
    id: "chat",
    icon: MessageCircle,
    title: "Chatul dintre agenți",
    faqs: [
      {
        q: "Cu cine pot vorbi în chatul din Habitoo?",
        a: "Cu orice utilizator activ al Habitoo: colegii din agenția ta, agenți din alte agenții și echipa platformei. Deschizi Mesaje din meniu, cauți persoana și începi conversația.",
      },
      {
        q: "Cum știu dacă cineva este disponibil?",
        a: "În lista de contacte și în fiecare conversație vezi starea persoanei: Online, dacă a fost activă în ultimele minute, sau momentul ultimei activități, de exemplu „Activ acum 5 min” sau „Activ ieri la 18:05”.",
      },
      {
        q: "Primesc mesajele și pe email?",
        a: "Da. Dacă nu ai citit un mesaj în 15 minute, primești un email de notificare. Pentru aceeași conversație primești cel mult un email pe oră, ca să nu îți umplem căsuța de mail.",
      },
      {
        q: "Pot bloca pe cineva?",
        a: "Da. Din conversație poți bloca orice persoană; după blocare, aceea persoană nu îți mai poate trimite mesaje. Deblocarea se face tot din conversație, oricând.",
      },
      {
        q: "Cine vede conversațiile mele?",
        a: "Doar tu și persoana cu care vorbești. Conversațiile sunt private între cei doi participanți; nimeni altcineva din agenție sau din platformă nu le poate citi.",
      },
    ],
  },
  {
    id: "cont",
    icon: UserPlus,
    title: "Activarea contului",
    faqs: [
      {
        q: "Cum îmi creez cont de agenție în Habitoo?",
        a: "Intri pe pagina de înregistrare, completezi datele agenției și adresa ta de email, apoi confirmi adresa din emailul primit. După confirmare creezi agenția și poți invita echipa.",
      },
      {
        q: "Cum îmi activez contul după înregistrare?",
        a: "După înregistrare primești un email de confirmare la adresa introdusă. Deschizi emailul și apeși linkul de confirmare; contul devine activ imediat și te poți autentifica.",
      },
      {
        q: "Nu am primit emailul de confirmare. Ce fac?",
        a: "Verifică mai întâi folderul Spam sau Promoții. Dacă nu este nici acolo, revino pe pagina de autentificare și cere retrimiterea emailului de confirmare. Dacă problema continuă, scrie-ne din pagina Contact.",
      },
      {
        q: "Cum îmi adaug colegii în agenție?",
        a: "Din Setări → Echipă inviți colegii pe adresa lor de email. Fiecare primește o invitație, își creează parola și intră direct în agenția ta, cu rolul pe care i l-ai dat: agent sau manager.",
      },
      {
        q: "Am uitat parola. Cum o resetez?",
        a: "Pe pagina de autentificare apeși „Ai uitat parola?”, introduci adresa de email și primești un link de resetare. Linkul te duce la o pagină unde îți alegi parola nouă.",
      },
    ],
  },
];

const allFaqs = FAQ_GROUPS.flatMap((g) => g.faqs);

export const Route = createFileRoute("/intrebari-frecvente")({
  head: () =>
    publicHead({
      path: "/intrebari-frecvente",
      title: TITLE,
      description: DESCRIPTION,
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          pageJsonLd({ path: "/intrebari-frecvente", name: "Întrebări frecvente", description: DESCRIPTION }),
          {
            "@type": "FAQPage",
            mainEntity: allFaqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
        ],
      },
    }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <PublicLayout footerDescription="CRM imobiliar pentru agențiile din România, într-o singură platformă.">
      <section className="mk-hero-bg border-b border-border">
        <Container className="py-16 sm:py-20 lg:py-24">
          <SectionHeading
            as="h1"
            title="Întrebări frecvente"
            text="Răspunsuri scurte despre publicarea pe portaluri, chatul dintre agenți și activarea contului."
          />
        </Container>
      </section>

      {FAQ_GROUPS.map((group, gi) => (
        <Section key={group.id} tone={gi % 2 === 1 ? "muted" : undefined}>
          <Container className="max-w-3xl">
            <Reveal>
              <Eyebrow>
                <group.icon className="size-3.5" /> {group.title}
              </Eyebrow>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-navy sm:text-3xl">
                {group.title}
              </h2>
            </Reveal>
            <Accordion type="single" collapsible className="mt-8">
              {group.faqs.map((f, i) => (
                <AccordionItem key={f.q} value={`${group.id}-${i}`}>
                  <AccordionTrigger className="text-left text-base font-medium">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Container>
        </Section>
      ))}

      <Section>
        <Container className="max-w-3xl text-center">
          <p className="text-base text-muted-foreground">
            Nu ai găsit răspunsul? Vezi{" "}
            <Link to="/functionalitati" className="font-medium text-primary underline-offset-4 hover:underline">
              funcționalitățile
            </Link>
            ,{" "}
            <Link to="/integrari" className="font-medium text-primary underline-offset-4 hover:underline">
              integrările cu portalurile
            </Link>{" "}
            sau scrie-ne din pagina de{" "}
            <Link to="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
              contact
            </Link>
            .
          </p>
        </Container>
      </Section>

      <CtaBand
        title="Testează Habitoo cu agenția ta."
        text="Creează agenția în câteva minute, invită echipa și publică primele anunțuri pe portaluri dintr-un singur loc."
      />
    </PublicLayout>
  );
}
