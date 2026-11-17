import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { FaqSection, faqPageJsonLd } from "@/components/marketing/FaqSection";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section } from "@/components/marketing/Section";
import { publicHead, SITE_URL } from "@/components/marketing/public-head";
import { FEATURE_PAGE_ALIASES, featureEntryByKey, featurePageBySlug, type FeaturePage } from "@/lib/marketing/feature-pages";
import { integrationPageBySlug, withPublicPortalCount } from "@/lib/portals/integration-pages";
import { getPublicDynamicFeedPortals } from "@/lib/dynamic-feed-portals.functions";
import { Eyebrow } from "@/components/marketing/Section";
import { PublicAnswer } from "@/components/marketing/PublicAnswer";

function featureJsonLd(page: FeaturePage) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Acasă", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Funcționalități", item: `${SITE_URL}/functionalitati` },
        { "@type": "ListItem", position: 3, name: page.name, item: `${SITE_URL}/functionalitati/${page.slug}` },
      ],
    },
    faqPageJsonLd(page.faq),
  ];
}

export const Route = createFileRoute("/functionalitati_/$slug")({
  loader: async ({ params }) => {
    const alias = FEATURE_PAGE_ALIASES[params.slug];
    if (alias) throw redirect({ to: "/functionalitati/$slug", params: { slug: alias }, statusCode: 301 });
    const page = featurePageBySlug(params.slug);
    if (!page) throw notFound();
    return { slug: page.slug, dynamic: await getPublicDynamicFeedPortals() };
  },
  head: ({ loaderData }) => {
    const page = loaderData ? featurePageBySlug(loaderData.slug) : null;
    if (!page) return { meta: [{ title: "Pagină indisponibilă — Habitoo" }, { name: "robots", content: "noindex" }] };
    return publicHead({ path: `/functionalitati/${page.slug}`, title: page.title, description: page.description, jsonLd: featureJsonLd(page) });
  },
  notFoundComponent: () => (
    <PublicLayout>
      <Container className="py-24 text-center">
        <h1 className="text-3xl font-semibold text-navy">Pagina nu există</h1>
        <Link to="/functionalitati" className="mt-4 inline-block text-primary underline">Vezi toate funcționalitățile</Link>
      </Container>
    </PublicLayout>
  ),
  component: FeaturePageView,
});

function related(slug: string): { name: string; href: string } | null {
  const f = featurePageBySlug(slug);
  if (f) return { name: f.name, href: `/functionalitati/${f.slug}` };
  const e = featureEntryByKey(slug);
  if (e) return { name: e.name, href: e.hash ? `${e.to}#${e.hash}` : e.to };
  const i = integrationPageBySlug(slug);
  if (i) return { name: `Integrare ${i.name}`, href: `/integrari/${i.slug}` };
  return null;
}

function FeaturePageView() {
  const { slug, dynamic = [] } = Route.useLoaderData();
  const t = (text: string) => withPublicPortalCount(text, dynamic);
  const page = featurePageBySlug(slug);
  if (!page) throw notFound();
  const candidates = [...page.related, "proprietati", "contacte", "cereri", "potriviri-automate"];
  const links = candidates.map(related).filter((x): x is { name: string; href: string } => !!x && x.href !== `/functionalitati/${slug}`).filter((x, index, all) => all.findIndex(y => y.href === x.href) === index).slice(0, 4);
  return (
    <PublicLayout>
      <section className="mk-page-hero border-b">
        <Container className="py-14 sm:py-20">
          <nav aria-label="Navigare" className="mb-6 text-sm text-muted-foreground">
            <Link to="/" className="hover:underline">Acasă</Link> ›{" "}
            <Link to="/functionalitati" className="hover:underline">Funcționalități</Link> › <span>{page.name}</span>
          </nav>
          <Eyebrow className="mb-4">Funcționalități</Eyebrow>
          <h1 className="text-4xl font-semibold tracking-tight text-balance text-navy sm:text-5xl">{page.h1}</h1>
          <PublicAnswer path={`/functionalitati/${slug}`} />
          <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-foreground sm:text-lg">
            {page.intro.map((p) => <p key={p}>{t(p)}</p>)}
          </div>
        </Container>
      </section>
      <Section>
        <Container>
          <h2 className="text-2xl font-semibold tracking-tight text-navy">Ce câștigi</h2>
          <ul className="mt-6 grid auto-rows-fr gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {page.benefits.map((b) => (
              <li key={b.title} className="ds-card ds-feature-card flex h-full flex-col p-5">
                <span className="ds-icon-tile" aria-hidden><Check className="size-5" /></span>
                <h3 className="mt-4 font-semibold text-navy">{b.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t(b.text)}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
      <Section tone="muted">
        <Container>
          <h2 className="text-2xl font-semibold tracking-tight text-navy">Cum funcționează</h2>
          <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {page.steps.map((s, i) => (
              <li key={s.title} className="ds-card h-full p-5">
                <span className="font-mono text-xs ds-ai">{String(i + 1).padStart(2, "0")} / Pasul {i + 1}</span>
                <h3 className="mt-1 font-semibold text-navy">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t(s.text)}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>
      <FaqSection items={page.faq} title={`Întrebări despre ${page.name}`} />
      {links.length > 0 && (
        <Section className="pt-0 sm:pt-0 lg:pt-0">
          <Container>
            <h2 className="text-2xl font-semibold tracking-tight text-navy">Vezi și</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {links.map((l) => (
                <li key={l.href}><a href={l.href} className="ds-card ds-feature-card inline-flex items-center gap-1 px-4 py-2.5 text-sm font-medium text-navy">{l.name} <span className="ds-ai" aria-hidden>→</span></a></li>
              ))}
            </ul>
          </Container>
        </Section>
      )}
      <CtaBand />
    </PublicLayout>
  );
}
