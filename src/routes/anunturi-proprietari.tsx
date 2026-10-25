import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { publicHead } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { FaqSection, faqPageJsonLd } from "@/components/marketing/FaqSection";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { CtaBand } from "@/components/marketing/CtaBand";
import { OWNER_LISTINGS_PATH, OWNER_LISTINGS_TITLE, OWNER_LISTINGS_DESCRIPTION, ownerStatisticsText, ownerListingsFaq } from "@/components/marketing/owner-listings-content";
import { getPublicOwnerStatistics } from "@/lib/public-owner-listings.functions";

const statisticsQuery = queryOptions({
  queryKey: ["public-owner-statistics"],
  queryFn: () => getPublicOwnerStatistics(),
  staleTime: 0,
});

export const Route = createFileRoute("/anunturi-proprietari")({
  loader: ({ context }) => context.queryClient.ensureQueryData(statisticsQuery),
  head: ({ loaderData }) => publicHead({
    path: OWNER_LISTINGS_PATH,
    title: OWNER_LISTINGS_TITLE,
    description: OWNER_LISTINGS_DESCRIPTION,
    jsonLd: [
      ...pageJsonLd({ path: OWNER_LISTINGS_PATH, name: "Anunțuri de la proprietari", description: OWNER_LISTINGS_DESCRIPTION }),
      ...(loaderData ? [{ ...faqPageJsonLd(ownerListingsFaq(ownerStatisticsText(loaderData.statistics, loaderData.observedAt))), "@id": "https://www.habitoo.ro/anunturi-proprietari#faq", isPartOf: { "@id": "https://www.habitoo.ro/anunturi-proprietari#webpage" } }] : []),
    ],
  }),
  component: OwnerListingsPage,
  errorComponent: () => <PublicLayout><Section><Container><p role="alert">Cifrele publice nu au putut fi încărcate. Te rugăm să reîncerci.</p></Container></Section></PublicLayout>,
  notFoundComponent: () => <PublicLayout><Section><Container><p>Pagina nu este disponibilă.</p></Container></Section></PublicLayout>,
});

const sections = [
  { title: "Cum găsești anunțurile din zona ta", text: "Cauți județul și localitatea după nume. Zonele le alegi pe mai multe deodată, iar la București sunt grupate pe sectoare. Restul filtrelor: tip, camere, preț, suprafață. Anunțurile din toate sursele apar amestecate, cele mai noi primele." },
  { title: "Cum ajunge un anunț în portofoliul tău", text: "Apeși „Importă în portofoliu” și confirmi că ai acordul proprietarului. Proprietatea apare ca ciornă, cu descrierea, detaliile și pozele. În notițele interne rămân linkul original și confirmarea acordului, cu agentul și ora. Nu se publică nimic automat, iar un anunț importat a doua oară nu creează dublură." },
  { title: "Comentarii între agenți", text: "Agenții din agențiile active pot lăsa comentarii la un anunț, de exemplu „proprietarul a vândut” sau „lucrează deja cu o agenție”, ca să nu suni degeaba." },
  { title: "Argus, pentru agențiile cu abonament", text: "Agențiile care au abonament Argus îl pot conecta și caută live în datele Argus, într-un tab separat. Telefonul se cere doar când apeși „Arată telefon”." },
];

const limitations = [
  "Nu garantează că fiecare anunț e de la proprietar: anunțurile recunoscute ca fiind de agenție sunt scoase, dar recunoașterea nu e perfectă.",
  "La majoritatea anunțurilor nu afișează telefonul proprietarului.",
  "Nu contactează proprietarii în locul tău.",
  "Anunțurile care nu mai sunt actualizate dispar după 60 de zile.",
  "Unele poze pot avea filigranul portalului de origine.",
  "Nu importă și nu publică nimic fără confirmarea ta.",
];

function OwnerListingsPage() {
  const { data } = useSuspenseQuery(statisticsQuery);
  const statisticsText = ownerStatisticsText(data.statistics, data.observedAt);
  return (
    <PublicLayout>
      <section className="border-b border-border bg-muted/40">
        <Container className="py-14 sm:py-20">
          <SectionHeading as="h1" eyebrow="Anunțuri de la proprietari" title="Anunțurile de la proprietari din cinci portaluri, într-o singură listă" text="Habitoo adună automat anunțurile publicate de proprietari pe portalurile imobiliare și le pune într-o listă comună, filtrabilă pe județ, oraș și cartier. Agentul vede ce e nou în zona lui fără să deschidă cinci site-uri." />
        </Container>
      </section>
      <Section className="py-12 sm:py-16 lg:py-16">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="De unde vin anunțurile" text="Din Storia, OLX, Romimo (Publi24), Imoradar24 (care include anunțuri de pe Imobiliare.ro și alte site-uri) și Anuntul.ro. Lista se actualizează la fiecare 30 de minute pentru majoritatea surselor." />
          <p className="mt-6 border-l-2 border-primary pl-5 text-base leading-relaxed text-foreground">{statisticsText}</p>
          {sections.map((section) => (
            <section key={section.title} className="mt-12 border-t border-border pt-10">
              <SectionHeading align="left" title={section.title} text={section.text} />
            </section>
          ))}
          <section className="mt-12 border-t border-border pt-10">
            <SectionHeading align="left" title="Ce nu face modulul" />
            <ul className="mt-6 list-disc space-y-3 pl-5 text-base leading-relaxed text-muted-foreground">
              {limitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </Container>
      </Section>
      <FaqSection title="Întrebări frecvente" items={ownerListingsFaq(statisticsText)} />
      <Section tone="muted" className="py-12 sm:py-14 lg:py-14">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Continuă cu" />
          <nav aria-label="Continuă cu" className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {([{ to: "/integrari", label: "Integrări" }, { to: "/preturi", label: "Prețuri" }, { to: "/intrebari-frecvente", label: "Întrebări frecvente" }] as const).map((link) => (
              <Button key={link.to} asChild variant="link" className="px-0"><Link to={link.to}>{link.label}<ArrowRight /></Link></Button>
            ))}
          </nav>
        </Container>
      </Section>
      <CtaBand />
    </PublicLayout>
  );
}