import { createFileRoute } from "@tanstack/react-router";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PortalGrid } from "@/components/marketing/PortalGrid";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";

const TITLE = "Integrări cu portalurile imobiliare — Habitoo CRM";
const DESCRIPTION = "Introduci anunțul o singură dată în Habitoo și alegi, pentru fiecare anunț, pe ce portaluri apare.";
const META_DESCRIPTION = "CRM imobiliar Habitoo publică anunțurile pe Storia, OLX, Imobiliare.ro, Romimo, Imospot, VDI.ro și alte portaluri. Introduci anunțul o dată, alegi unde apare.";

export const MULTI_PORTAL_INTRO = [
  "Majoritatea agențiilor își publică anunțurile pe mai multe portaluri, pentru că fiecare portal aduce alți clienți. Problema apare la lucrul de zi cu zi: același anunț trebuie scris în fiecare cont, cu aceleași poze, iar fiecare schimbare de preț trebuie făcută de mai multe ori. Când proprietatea se vinde, e ușor să rămână un anunț uitat pe un portal, iar clienții sună degeaba.",
  "Cu Habitoo introduci anunțul o singură dată, în fișa proprietății: datele, pozele, descrierea și agentul responsabil. Apoi, în fila Publicare, alegi pe ce portaluri apare. Bifezi portalurile dorite și apeși Publică, iar Habitoo trimite anunțul spre fiecare. Trimiterea continuă și dacă închizi pagina, iar dacă un portal respinge anunțul primești o notificare cu motivul.",
  "Când schimbi prețul sau pozele, modifici o singură dată în Habitoo și trimiți varianta nouă pe toate portalurile alese. Unele portaluri primesc anunțul imediat, altele îl preiau singure, periodic, din Habitoo; pe pagina fiecărei integrări scrie exact cum funcționează.",
  "Când renunți la un portal, îl debifezi și anunțul se retrage de acolo. Când proprietatea devine Vândută, Închiriată sau Arhivată, anunțul se retrage automat de pe portalurile care permit asta, fără să intri în fiecare cont. Astfel, ce văd clienții online rămâne la fel cu ce ai în CRM.",
  "Toată echipa lucrează în același sistem. Pe fiecare proprietate vezi pe ce portaluri este publicată, când a fost trimisă ultima dată și dacă a apărut o problemă. Mesajele clienților de pe portalurile care permit asta ajung direct în CRM, ca lead-uri, la agentul proprietății, ca să nu se piardă nicio cerere.",
  "Fiecare portal se activează separat, din Setări → Portaluri, de către administratorul agenției. Alege mai jos un portal ca să vezi ce poți face cu el, cum îl activezi și ce e bine de știut.",
];

const deliveryDescriptions = [
  "Trimitere directă: Habitoo trimite anunțul către portal când îl publici; actualizările se trimit când apeși «Publică», iar la Vândut, Închiriat sau Arhivat anunțul este retras automat.",
  "Feed: anunțurile selectate apar în feedul Habitoo, pe care portalul îl citește periodic; modificările și retragerile apar la următoarea citire a portalului.",
  "Catalog Facebook: anunțurile pe care le activezi intră în feedul de catalog citit de Meta Commerce Manager; un anunț dezactivat sau vândut iese din catalog la următoarea citire.",
];

export const Route = createFileRoute("/integrari")({
  head: () => publicHead({
    path: "/integrari",
    title: TITLE,
    description: META_DESCRIPTION,
    jsonLd: pageJsonLd({ path: "/integrari", name: "Integrări cu portalurile imobiliare", description: DESCRIPTION }),
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <PublicLayout footerDescription="CRM imobiliar pentru agențiile din România, într-o singură platformă.">
      <section className="mk-hero-bg border-b border-border">
        <Container className="py-16 sm:py-20 lg:py-24">
          <SectionHeading as="h1" title="Integrări cu portalurile imobiliare" text={DESCRIPTION} />
        </Container>
      </section>
      <Section>
        <Container className="max-w-3xl space-y-4 text-base leading-relaxed text-foreground sm:text-lg">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">Publici pe mai multe portaluri dintr-un singur loc</h2>
          {MULTI_PORTAL_INTRO.map((p) => <p key={p}>{p}</p>)}
        </Container>
        <Container><PortalGrid linkToPages /></Container>
        <Container className="mt-10 text-center">
          <p className="text-sm text-muted-foreground">
            Ai întrebări despre publicare? Vezi{" "}
            <Link to="/intrebari-frecvente" className="font-medium text-primary underline-offset-4 hover:underline">
              întrebările frecvente
            </Link>
            .
          </p>
        </Container>
      </Section>
      <Section tone="muted">
        <Container>
          <div className="grid gap-8 md:grid-cols-3">
            {deliveryDescriptions.map((description) => (
              <p key={description} className="text-sm leading-relaxed text-foreground sm:text-base">{description}</p>
            ))}
          </div>
        </Container>
      </Section>
      <CtaBand text="Creează agenția în câteva minute, invită echipa și lucrează dintr-un singur sistem." />
    </PublicLayout>
  );
}