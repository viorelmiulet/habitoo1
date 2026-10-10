import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { integrationPageBySlug, RELATED_CTA_TEXT } from "@/lib/portals/integration-pages";
import { integrationJsonLd } from "@/lib/portals/integration-jsonld";

export const Route = createFileRoute("/integrari_/$slug")({
  loader: ({ params }) => {
    const page = integrationPageBySlug(params.slug);
    if (!page) throw notFound();
    return { slug: page.slug };
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
  const { slug } = Route.useLoaderData();
  const page = integrationPageBySlug(slug)!;
  return (
    <PublicLayout>
      <section className="mk-hero-bg border-b border-border">
        <Container className="py-14 sm:py-20">
          <nav aria-label="Navigare" className="mb-6 text-sm text-muted-foreground">
            <Link to="/" className="hover:underline">Acasă</Link> ›{" "}
            <Link to="/integrari" className="hover:underline">Integrări</Link> › <span>{page.name}</span>
          </nav>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <PortalLogoStack portalId={page.portalId} name={page.name} size={64} className="shrink-0" />
            <h1 className="text-4xl font-semibold tracking-tight text-balance text-navy sm:text-5xl">
              Integrare {page.name} cu Habitoo CRM
            </h1>
          </div>
          <div className="mt-6 max-w-3xl space-y-4 text-base text-muted-foreground sm:text-lg">
            {page.intro.map((p) => <p key={p}>{p}</p>)}
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
