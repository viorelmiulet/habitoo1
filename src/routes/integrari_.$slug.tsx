import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { dynamicIntegrationPageBySlug, integrationPageAliasTarget, integrationPageBySlug as staticPageBySlug, RELATED_CTA_TEXT } from "@/lib/portals/integration-pages";
import { integrationJsonLd } from "@/lib/portals/integration-jsonld";
import { getPublicDynamicFeedPortals } from "@/lib/dynamic-feed-portals.functions";

/** Pagini statice din registru sau pagini ale portalurilor adăugate din SuperAdmin. */
function integrationPageBySlug(slug: string) {
  return staticPageBySlug(slug) ?? dynamicIntegrationPageBySlug(slug);
}

export const Route = createFileRoute("/integrari_/$slug")({
  // Adresele alternative (ex. /integrari/storia-olx) merg 301 spre pagina canonică,
  // cu query string-ul păstrat. Adresele necunoscute rămân 404, în loader.
  beforeLoad: ({ params, location }) => {
    if (integrationPageBySlug(params.slug)) return;
    const target = integrationPageAliasTarget(params.slug);
    if (target) {
      const query = location.searchStr.replace(/^\?+/, "");
      throw redirect({
        href: `/integrari/${target}${query ? `?${query}` : ""}`,
        statusCode: 301,
      });
    }
  },
  loader: async ({ params }) => {
    const page = staticPageBySlug(params.slug);
    if (page) return { slug: page.slug, logoUrl: null as string | null };
    const dynamicPage = dynamicIntegrationPageBySlug(params.slug);
    if (!dynamicPage) throw notFound();
    // Pagina există doar cât timp portalul e activ și vizibil public din SuperAdmin.
    const portal = (await getPublicDynamicFeedPortals()).find((p) => p.id === dynamicPage.slug);
    if (!portal) throw notFound();
    return { slug: dynamicPage.slug, logoUrl: portal.logo_url ? `/api/public/portal-logo/${dynamicPage.slug}` : null };
  },
  head: ({ loaderData }) => {
    const page = loaderData ? integrationPageBySlug(loaderData.slug) : null;
    if (!page) return { meta: [{ title: "Integrare indisponibilă — Habitoo" }, { name: "robots", content: "noindex" }] };
    return publicHead({
      path: `/integrari/${page.slug}`,
      title: page.title,
      description: page.description,
      jsonLd: integrationJsonLd(page),
    });
  },
  component: IntegrationPage,
});

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-semibold tracking-tight text-navy">{children}</h2>;
}

function IntegrationPage() {
  const { slug, logoUrl } = Route.useLoaderData();
  const page = integrationPageBySlug(slug)!;
  return (
    <PublicLayout>
      <section className="mk-page-hero border-b">
        <Container className="py-14 sm:py-20">
          <nav aria-label="Navigare" className="mb-6 text-sm text-muted-foreground">
            <Link to="/" className="hover:underline">Acasă</Link> ›{" "}
            <Link to="/integrari" className="hover:underline">Integrări</Link> › <span>{page.name}</span>
          </nav>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {logoUrl ? (
              <img src={logoUrl} alt={`Logo ${page.name}`} className="h-16 w-auto max-w-[200px] shrink-0 object-contain" />
            ) : (
              <PortalLogoStack portalId={page.portalId} name={page.name} size={64} className="shrink-0" />
            )}
            <h1 className="text-4xl font-semibold tracking-tight text-balance text-navy sm:text-5xl">
              Integrare {page.name} cu Habitoo CRM
            </h1>
          </div>
          {page.announcement ? (
            <p role="note" className="mt-6 max-w-3xl rounded-lg border border-border bg-muted px-4 py-3 font-medium text-foreground">
              {page.announcement}
            </p>
          ) : null}
          <div className="mt-6 max-w-3xl space-y-4 text-base text-muted-foreground sm:text-lg">
            {page.intro.map((p) => <p key={p}>{p}</p>)}
            {page.website ? (
              <p>
                Site oficial:{" "}
                <a href={page.website.href} target="_blank" rel="noopener" className="font-medium text-primary underline-offset-4 hover:underline">
                  {page.website.label}
                </a>
              </p>
            ) : null}
            <p>{page.whyHabitoo}</p>
          </div>
        </Container>
      </section>
      <Section>
        <Container className="grid max-w-5xl gap-12 md:grid-cols-2">
          <div className="space-y-4">
            <H2>Ce poți face</H2>
            <ul className="list-disc space-y-2 pl-5 text-foreground">
              {page.canDo.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
          <div className="space-y-4">
            <H2>Cum lucrezi în fiecare zi</H2>
            {page.dailyWork.map((t) => <p key={t} className="text-foreground">{t}</p>)}
          </div>
          <div className="space-y-4">
            <H2>Cum activezi</H2>
            <p className="text-foreground">{page.activationText}</p>
          </div>
          <div className="space-y-4">
            <H2>Bine de știut</H2>
            <ul className="list-disc space-y-2 pl-5 text-foreground">
              {page.notes.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
        </Container>
      </Section>
      <Section tone="muted">
        <Container className="max-w-3xl space-y-6">
          <H2>Întrebări frecvente</H2>
          {page.faq.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold text-navy">{f.q}</h3>
              <p className="mt-1 text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </Container>
      </Section>
      <Section>
        <Container className="max-w-3xl space-y-4">
          <H2>Alte integrări</H2>
          <ul className="flex flex-wrap gap-3">
            {page.related.map((r) => (
              <li key={r.slug}>
                <Link to="/integrari/$slug" params={{ slug: r.slug }} className="panel inline-block px-4 py-2 text-sm font-semibold text-navy hover:underline">
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm">
            <Link to="/integrari" className="text-primary underline">Toate integrările</Link>
            {" · "}
            <Link to="/functionalitati" className="text-primary underline">Funcționalități</Link>
          </p>
        </Container>
      </Section>
      <CtaBand text={RELATED_CTA_TEXT} />
    </PublicLayout>
  );
}
