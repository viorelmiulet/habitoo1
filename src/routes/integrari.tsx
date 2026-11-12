import { createFileRoute, Link } from "@tanstack/react-router";
import { CtaBand } from "@/components/marketing/CtaBand";
import { IntegrationsOverview } from "@/components/marketing/IntegrationsOverview";
import { IntegrationsIllustration } from "@/components/marketing/IntegrationsIllustration";
import { CrmLink } from "@/components/marketing/CrmLink";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { integrationItemListJsonLd } from "@/lib/portals/integration-overview";
import { dynamicIntegrationPageBySlug, INTEGRATION_PAGES, integrationFeatures, numeralLabel, portalsLabel, publicPortalCount } from "@/lib/portals/integration-pages";
import { FaqSection, faqPageJsonLd, type FaqItem } from "@/components/marketing/FaqSection";
import { Check, Minus } from "lucide-react";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { getPublicDynamicFeedPortals } from "@/lib/dynamic-feed-portals.functions";

export const PORTAL_COUNT = publicPortalCount([]);
const N = PORTAL_COUNT;
export const H1 = `Integrări cu ${portalsLabel(N)} imobiliare din România`;
const LEAD_TEXT = "Habitoo CRM are cele mai multe integrări cu portalurile imobiliare din România.";
const TITLE = `${numeralLabel(N, "integrare", "integrări")} cu portaluri imobiliare | Habitoo CRM`;
const DESCRIPTION = `Introduci anunțul o singură dată în Habitoo și îl publici pe ${portalsLabel(N)} imobiliare din România, cu actualizare și retragere automată.`;
const META_DESCRIPTION = `Habitoo CRM este conectat la ${portalsLabel(N)} imobiliare din România: introduci anunțul o dată, îl actualizezi și îl retragi automat, iar cererile intră în CRM.`;

const tablePages = INTEGRATION_PAGES.filter((p) => p.portalId !== "facebook_catalog");
const GROUPS = [
  { title: "Publicare directă din Habitoo", text: "Apeși Publică în fișa proprietății, iar anunțul pleacă imediat spre portal. Modificările și retragerea se trimit la fel, din Habitoo.", pages: tablePages.filter((p) => integrationFeatures(p).direct) },
  { title: "Portaluri care preiau anunțurile automat", text: "Bifezi portalul la ofertele alese, iar portalul le preia singur, periodic. Modificările și ofertele debifate se actualizează la următoarea preluare.", pages: tablePages.filter((p) => integrationFeatures(p).pulled) },
  { title: "Portaluri cu cereri de la clienți în CRM", text: "Mesajele clienților de pe aceste portaluri ajung ca lead-uri în Habitoo, la agentul proprietății, fără să le copiezi de mână.", pages: tablePages.filter((p) => integrationFeatures(p).leads) },
];
const WHY = [
  { title: "Un singur loc de lucru", text: "Introduci proprietatea o dată și alegi portalurile din aceeași fișă, fără conturi separate pentru fiecare portal." },
  { title: "Anunțuri mereu la zi", text: "Prețul, textul și pozele modificate în Habitoo ajung pe portaluri, iar la vânzare anunțul se retrage automat." },
  { title: "Nicio cerere pierdută", text: "Cererile clienților de pe portalurile care le trimit intră direct în CRM, la agentul responsabil." },
];
export const INTEGRARI_FAQ: FaqItem[] = [
  { q: "Pe câte portaluri pot publica din Habitoo?", a: `Din Habitoo poți publica pe ${portalsLabel(N)} imobiliare din România și internaționale. Lista completă, cu ce face fiecare integrare, este pe această pagină.` },
  { q: "Câte portaluri are Habitoo față de alte CRM-uri?", a: `Habitoo este conectat la ${portalsLabel(N)}, cele mai multe dintre CRM-urile imobiliare din România, iar lista completă e pe această pagină.` },
  { q: "Costă ceva în plus integrările?", a: "Integrările sunt incluse în abonamentul Habitoo. Pachetele sau promovările cumpărate direct de la portaluri rămân între agenție și portal." },
  { q: "Cine activează un portal?", a: "Administratorul agenției, din Setări → Portaluri. Unele portaluri se activează dintr-un click, altele cer contul agenției de pe portal; fiecare pagină de integrare explică pașii." },
  { q: "Ce se întâmplă cu anunțurile la vânzare?", a: "Când marchezi proprietatea Vândută, Închiriată sau Arhivată, anunțul se retrage automat de pe portalurile pe care era publicat." },
];

export const MULTI_PORTAL_INTRO = [
  "Fiecare portal aduce alți clienți. Cu Habitoo nu mai copiezi același anunț în fiecare cont: introduci datele și pozele o singură dată, apoi alegi portalurile din fila Publicare.",
  "Apeși Publică și trimiterea continuă chiar dacă închizi pagina. Modifici prețul sau pozele tot în Habitoo; portalurile primesc varianta nouă direct sau la următoarea preluare.",
  "La Vândută, Închiriată sau Arhivată, anunțul se retrage automat de pe portalurile care permit asta. Vezi starea fiecărei publicări și primești o notificare dacă apare o problemă.",
  "Mesajele de pe portalurile compatibile ajung ca lead-uri la agentul proprietății. Administratorul activează fiecare integrare din Setări → Portaluri; detaliile și limitele sunt pe pagina ei.",
];

const deliveryDescriptions = [
  "Publicare directă: apeși Publică pentru a trimite anunțul și modificările. Retragerea automată este disponibilă doar pe portalurile care o permit.",
  "Preluare automată: portalul citește periodic ofertele alese din Habitoo. Modificările și retragerile apar la următoarea preluare.",
  "Catalog Facebook: alegi anunțurile pentru reclame. Cele dezactivate sau vândute ies din catalog la următoarea preluare.",
];

export const Route = createFileRoute("/integrari")({
  loader: () => getPublicDynamicFeedPortals(),
  head: ({ loaderData }) => {
    const count = PORTAL_COUNT + (loaderData?.length ?? 0);
    const title = `${numeralLabel(count, "integrare", "integrări")} cu portaluri imobiliare | Habitoo CRM`;
    const description = META_DESCRIPTION.replace(portalsLabel(N), portalsLabel(count));
    const faq = INTEGRARI_FAQ.map(item => ({ ...item, a: item.a.replace(portalsLabel(N), portalsLabel(count)) }));
    const list = integrationItemListJsonLd();
    const extra = (loaderData ?? []).map((p, i) => ({ "@type": "ListItem", position: list.itemListElement.length + i + 1, name: p.display_name, url: p.website ?? "https://www.habitoo.ro/integrari" }));
    return publicHead({
    path: "/integrari",
    title,
    description,
    jsonLd: [...pageJsonLd({ path: "/integrari", name: `Integrări cu ${portalsLabel(count)} imobiliare din România`, description }), { ...list, numberOfItems: list.numberOfItems + extra.length, itemListElement: [...list.itemListElement, ...extra] }, faqPageJsonLd(faq)],
  }); },
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const dynamic = Route.useLoaderData();
  const count = PORTAL_COUNT + dynamic.length;
  const title = `Integrări cu ${portalsLabel(count)} imobiliare din România`;
  const description = DESCRIPTION.replace(portalsLabel(N), portalsLabel(count));
  const faq = INTEGRARI_FAQ.map(item => ({ ...item, a: item.a.replace(portalsLabel(N), portalsLabel(count)) }));
  return (
    <PublicLayout footerDescription="CRM imobiliar pentru agențiile din România, într-o singură platformă.">
      <section className="mk-page-hero overflow-hidden border-b">
        <Container className="pt-12 pb-8 sm:pt-16 sm:pb-12">
          <SectionHeading as="h1" title={title} text={LEAD_TEXT} />
          <p className="mx-auto mt-3 max-w-2xl text-center text-base text-muted-foreground">{description}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg"><CrmLink to="/register">Creează agenția <ArrowRight /></CrmLink></Button>
            <Button asChild size="lg" variant="outline"><Link to="/contact" search={{ interes: "demo" }}>Solicită o demonstrație</Link></Button>
          </div>
          <IntegrationsIllustration />
        </Container>
      </section>
      <Section className="py-10 sm:py-12 lg:py-16">
        <Container className="max-w-3xl space-y-4 text-base leading-relaxed text-foreground sm:text-lg">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">Publici pe mai multe portaluri dintr-un singur loc</h2>
          {MULTI_PORTAL_INTRO.map((p) => <p key={p}>{p}</p>)}
        </Container>
      </Section>
      <Section className="pt-0 sm:pt-0 lg:pt-0">
        <Container className="space-y-10">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h2 className="text-2xl font-semibold tracking-tight text-navy">{g.title}</h2>
              <p className="mt-2 max-w-3xl text-base text-muted-foreground">{g.text}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {g.pages.map((p) => (
                  <li key={p.slug}><Link to="/integrari/$slug" params={{ slug: p.slug }} className="panel inline-block px-3 py-2 text-sm font-medium text-navy hover:shadow-soft">{p.name}</Link></li>
                ))}
                {g !== GROUPS[0] && dynamic.map(p => dynamicIntegrationPageBySlug(p.id) ? <li key={p.id}><Link to="/integrari/$slug" params={{ slug: p.id }} className="panel inline-block px-3 py-2 text-sm font-medium text-navy hover:shadow-soft">{p.display_name}</Link></li> : <li key={p.id}><a href={p.website} target="_blank" rel="noopener noreferrer" className="panel inline-block px-3 py-2 text-sm font-medium text-navy">{p.display_name}</a></li>)}
              </ul>
            </div>
          ))}
        </Container>
      </Section>
      <Section tone="muted">
        <Container>
          <h2 className="text-2xl font-semibold tracking-tight text-navy">Ce face fiecare integrare</h2>
          <div className="mt-6 w-full max-w-full overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3 font-medium">Portal</th><th className="p-3 text-center font-medium">Publicare</th><th className="p-3 text-center font-medium">Actualizare automată</th><th className="p-3 text-center font-medium">Retragere</th><th className="p-3 text-center font-medium">Cereri clienți în CRM</th>
                </tr>
              </thead>
              <tbody>
                {tablePages.map((p) => {
                  const f = integrationFeatures(p);
                  return (
                    <tr key={p.slug} className="border-b last:border-0">
                      <td className="p-3"><Link to="/integrari/$slug" params={{ slug: p.slug }} className="font-medium text-navy hover:underline">{p.name}</Link></td>
                      {[f.publish, f.update, f.withdraw, f.leads].map((v, i) => (
                        <td key={i} className="p-3 text-center">{v ? <Check className="inline size-4 text-primary" aria-label="Da" /> : <Minus className="inline size-4 text-muted-foreground" aria-label="Nu" />}</td>
                      ))}
                    </tr>
                  );
                })}
                {dynamic.map(p => <tr key={p.id} className="border-b last:border-0"><td className="p-3 font-medium text-navy">{dynamicIntegrationPageBySlug(p.id) ? <Link to="/integrari/$slug" params={{ slug: p.id }} className="hover:underline">{p.display_name}</Link> : p.display_name}</td>{[true, true, true, true].map((_, i) => <td key={i} className="p-3 text-center"><Check className="inline size-4 text-primary" aria-label="Da" /></td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </Container>
      </Section>
      <Section>
        <Container>
          <h2 className="text-2xl font-semibold tracking-tight text-navy">De ce contează</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {WHY.map((w) => (
              <div key={w.title} className="panel p-5"><h3 className="font-semibold text-navy">{w.title}</h3><p className="mt-2 text-sm text-muted-foreground">{w.text}</p></div>
            ))}
          </div>
        </Container>
      </Section>
      <Section className="pt-0 sm:pt-0 lg:pt-0">
        <Container><IntegrationsOverview dynamic={dynamic} /></Container>
        <Container className="mt-10 text-center">
          <Button asChild variant="link" className="mb-4"><Link to="/dezvoltatori">Ești portal? Documentația API <ArrowRight /></Link></Button>
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
      <FaqSection items={faq} title="Întrebări despre integrări" />
      <CtaBand text="Creează agenția în câteva minute, invită echipa și lucrează dintr-un singur sistem." />
    </PublicLayout>
  );
}