import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { publicHead, SITE_URL } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { FaqSection, faqPageJsonLd } from "@/components/marketing/FaqSection";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PUBLIC_ACP_PATH, PUBLIC_ACP_TITLE, PUBLIC_ACP_DESCRIPTION, publicAcpScoring, publicMarketText, publicAcpFaq } from "@/components/marketing/acp-content";
import { getPublicOwnerStatistics } from "@/lib/public-owner-listings.functions";

const statisticsQuery = queryOptions({
  queryKey: ["public-acp-statistics"],
  queryFn: () => getPublicOwnerStatistics(),
  staleTime: 0,
});

export const Route = createFileRoute("/analiza-comparativa-de-piata")({
  loader: ({ context }) => context.queryClient.ensureQueryData(statisticsQuery),
  head: ({ loaderData }) => publicHead({
    path: PUBLIC_ACP_PATH,
    title: PUBLIC_ACP_TITLE,
    description: PUBLIC_ACP_DESCRIPTION,
    jsonLd: [
      ...pageJsonLd({ path: PUBLIC_ACP_PATH, name: "Analiză comparativă de piață", description: PUBLIC_ACP_DESCRIPTION }),
      ...(loaderData ? [{ ...faqPageJsonLd(publicAcpFaq(publicMarketText(loaderData.statistics, loaderData.observedAt))), "@id": `${SITE_URL}${PUBLIC_ACP_PATH}#faq`, isPartOf: { "@id": `${SITE_URL}${PUBLIC_ACP_PATH}#webpage` } }] : []),
    ],
  }),
  component: PublicAcpPage,
  errorComponent: () => <PublicLayout><Section><Container><p role="alert">Cifrele publice nu au putut fi încărcate. Te rugăm să reîncerci.</p></Container></Section></PublicLayout>,
});

const sections = [
  { title: "Ajustări explicate, nu cifre ascunse", text: "Prețul fiecărui comparabil se corectează pentru diferențele față de proprietatea ta (suprafață, etaj, an, stare, dotări), iar fiecare ajustare apare cu suma și motivul ei. Prețurile ieșite din tipar sunt marcate „Atipic” și nu strică media. Ofertele mai vechi pot fi aduse la zi cu indicele național de preț pe trimestru." },
  { title: "Ce primești", text: "Valoarea estimată cu interval minim–maxim, prețul recomandat de listare (cu marja de negociere), mediana și media prețului pe mp, un scor de încredere (după numărul, calitatea și dispersia comparabilelor), graficul prețurilor ajustate și lista comparabilelor cu scor, poze și sursă." },
  { title: "Tu decizi, analiza se recalculează", text: "Poți include sau exclude manual orice comparabil, iar analiza se recalculează. Fiecare rulare rămâne salvată ca versiune. Pentru client generezi un raport PDF dintr-o versiune, cu cifrele înghețate la data generării." },
];

const limitations = [
  "Nu este o evaluare autorizată ANEVAR și nu înlocuiește raportul de evaluare cerut de bănci.",
  "Folosește prețurile cerute în anunțuri, nu prețurile de tranzacție.",
  "Nu caută comparabile în alt oraș decât cel al proprietății.",
  "Când ofertele nu au etaj, an sau stare, criteriul primește scor neutru, iar încrederea scade.",
  "Nu inventează comparabile: dacă nu există oferte similare, analiza spune asta.",
  "Comentariul AI apare doar dacă agenția l-a activat și nu schimbă cifrele calculate.",
];

function PublicAcpPage() {
  const { data } = useSuspenseQuery(statisticsQuery);
  const statisticsText = publicMarketText(data.statistics, data.observedAt);
  const scoring = publicAcpScoring();
  const weightsText = scoring.components.map(({ label, weight }) => `${label.toLocaleLowerCase("ro-RO")} ${weight}%`).join(", ");
  return (
    <PublicLayout>
      <section className="border-b border-border bg-muted/40">
        <Container className="py-14 sm:py-20">
          <SectionHeading as="h1" eyebrow="Analiză comparativă de piață" title="Analiza comparativă de piață, din oferte reale, cu fiecare ajustare explicată" text="ACP-ul din Habitoo estimează prețul unei proprietăți din portofoliu comparând-o cu oferte similare: proprietățile agenției, ofertele partenerilor din colaborare și ofertele de piață adunate de pe portaluri. Calculul nu folosește AI: ponderi fixe, ajustări explicate și statistică robustă, deci aceeași analiză dă același rezultat de fiecare dată." />
        </Container>
      </section>
      <Section className="py-12 sm:py-16 lg:py-16">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Din ce oferte se face analiza" text="Trei surse, bifate implicit: proprietățile agenției, ofertele deschise colaborării de agențiile partenere și ofertele de piață (de la particulari și agenții) din Storia, OLX, Romimo, Imoradar24 și Anuntul.ro. Se caută doar oferte cu același tip de proprietate și de tranzacție, în același oraș; sectorul contează când are destule oferte, altfel se caută în tot orașul. O proprietate apărută pe mai multe portaluri se numără o singură dată." />
          <p className="mt-6 border-l-2 border-primary pl-5 text-base leading-relaxed text-foreground">{statisticsText}</p>
          <section className="mt-12 border-t border-border pt-10">
            <SectionHeading align="left" title="Cum se alege un comparabil: scor din 100" text={`Fiecare ofertă primește un scor de similaritate, cu ponderi fixe: ${weightsText}. De la ${scoring.direct} de puncte, comparabil direct; de la ${scoring.secondary} până sub ${scoring.direct}, secundar; sub ${scoring.secondary}, exclus din analiza principală. Când o informație lipsește, criteriul primește un scor neutru, nu o penalizare.`} />
          </section>
          {sections.map((section) => <section key={section.title} className="mt-12 border-t border-border pt-10"><SectionHeading align="left" title={section.title} text={section.text} /></section>)}
          <section className="mt-12 border-t border-border pt-10">
            <SectionHeading align="left" title="Ce nu face ACP" />
            <ul className="mt-6 list-disc space-y-3 pl-5 text-base leading-relaxed text-muted-foreground">{limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </Container>
      </Section>
      <FaqSection title="Întrebări frecvente" items={publicAcpFaq(statisticsText)} />
      <Section tone="muted" className="py-12 sm:py-14 lg:py-14">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Continuă cu" />
          <nav aria-label="Continuă cu" className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {([{ to: "/anunturi-proprietari", label: "Anunțuri de la proprietari" }, { to: "/integrari", label: "Integrări" }, { to: "/preturi", label: "Prețuri" }] as const).map((link) => <Button key={link.to} asChild variant="link" className="px-0"><Link to={link.to}>{link.label}<ArrowRight /></Link></Button>)}
          </nav>
        </Container>
      </Section>
      <CtaBand />
    </PublicLayout>
  );
}