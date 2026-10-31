import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { publicHead, SITE_URL } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { FaqSection } from "@/components/marketing/FaqSection";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { CtaBand } from "@/components/marketing/CtaBand";
import { listPublicPartners } from "@/lib/public-partners.functions";
import { partnerInitials, type PublicPartner } from "@/lib/public-partners";
import {
  PUBLIC_PARTNER_AGENCIES_DESCRIPTION,
  PUBLIC_PARTNER_AGENCIES_PATH,
  PUBLIC_PARTNER_AGENCIES_TITLE,
  partnerAgenciesFaq,
  partnerListingRules,
  partnerProgramSections,
} from "@/components/marketing/partner-agencies-content";

export const Route = createFileRoute("/agentii/")({
  loader: () => listPublicPartners(),
  head: ({ loaderData }) => {
    const partners = loaderData ?? [];
    return publicHead({
      path: PUBLIC_PARTNER_AGENCIES_PATH,
      title: PUBLIC_PARTNER_AGENCIES_TITLE,
      description: PUBLIC_PARTNER_AGENCIES_DESCRIPTION,
      noindex: partners.length === 0,
      jsonLd: [
        ...pageJsonLd({
          path: PUBLIC_PARTNER_AGENCIES_PATH,
          name: "Agenții partenere Habitoo",
          description: PUBLIC_PARTNER_AGENCIES_DESCRIPTION,
        }),
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Agenții partenere Habitoo",
          url: `${SITE_URL}${PUBLIC_PARTNER_AGENCIES_PATH}`,
          mainEntity: {
            "@type": "ItemList",
            itemListElement: partners.map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: p.name,
              ...(p.slug ? { url: `${SITE_URL}${PUBLIC_PARTNER_AGENCIES_PATH}/${p.slug}` } : {}),
            })),
          },
        },
      ],
    });
  },
  component: PartnersPage,
});

function PartnerCard({ partner }: { partner: PublicPartner }) {
  const body = (
    <>
      <div className="flex aspect-square w-full max-w-36 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background p-3">
        {partner.logoUrl ? (
          <img src={partner.logoUrl} alt={`Logo ${partner.name}`} loading="lazy" className="size-full object-contain" />
        ) : (
          <span className="flex size-full items-center justify-center rounded-xl bg-gold-tint font-display text-3xl font-semibold text-accent-foreground" aria-hidden>
            {partnerInitials(partner.name)}
          </span>
        )}
      </div>
      <p className="w-full break-words text-sm font-semibold text-navy sm:text-base">{partner.name}</p>
    </>
  );

  return (
    <li className="min-w-0">
      {partner.slug ? (
        <Link
          to="/agentii/$slug"
          params={{ slug: partner.slug }}
          className="flex min-w-0 flex-col items-center gap-3 rounded-[22px] border border-border bg-card p-4 text-center shadow-soft transition-shadow hover:shadow-md sm:p-5"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-col items-center gap-3 rounded-[22px] border border-border bg-card p-4 text-center shadow-soft sm:p-5">
          {body}
        </div>
      )}
    </li>
  );
}

function PartnersPage() {
  const partners = Route.useLoaderData();
  return (
    <PublicLayout homeHeader footerDescription="Agențiile imobiliare care lucrează cu Habitoo CRM.">
      <section className="mk-hero-bg border-b border-border">
        <Container className="py-14 sm:py-20">
          <SectionHeading
            as="h1"
            eyebrow="Agenții partenere"
            title="Agențiile partenere Habitoo"
            text="Agențiile imobiliare care lucrează zilnic în Habitoo CRM: își publică anunțurile pe portaluri, colaborează cu alte agenții și își urmăresc lead-urile și comisioanele din același sistem."
          />
          {partners.length > 0 ? (
            <p className="mt-6 text-sm font-semibold text-navy">
              {partners.length} {partners.length === 1 ? "agenție" : "agenții"} active acum în platformă.
            </p>
          ) : null}
        </Container>
      </section>

      <Section className="py-12 sm:py-14 lg:py-16">
        <Container>
          {partners.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-12 sm:px-10">
              <h2 className="font-display text-2xl font-semibold text-navy">
                Lista se completează pe măsură ce agențiile își deschid contul în Habitoo.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
                O agenție apare aici automat când are cont activ sau este în perioada de probă — fără dosar de
                înscriere, fără aprobare și fără taxă de listare. Spune-ne ce cauți și îți spunem ce agenții
                partenere lucrează în zona ta, sau creează contul agenției tale și intri în listă imediat.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="h-11 px-6">
                  <Link to="/contact">Scrie-ne ce cauți</Link>
                </Button>
                <Button asChild variant="outline" className="h-11 px-6">
                  <Link to="/register">Creează agenția</Link>
                </Button>
              </div>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
              {partners.map((p) => <PartnerCard key={p.name + (p.logoUrl ?? "")} partner={p} />)}
            </ul>
          )}
        </Container>
      </Section>

      <Section tone="muted">
        <Container className="max-w-3xl">
          <SectionHeading
            align="left"
            eyebrow="Programul de parteneriat"
            title="Ce înseamnă să lucrezi în Habitoo"
          />
          {partnerProgramSections.map((section, index) => (
            <section
              key={section.title}
              className={index === 0 ? "mt-8" : "mt-10 border-t border-border pt-8"}
            >
              <SectionHeading align="left" title={section.title} text={section.text} />
              {section.to && section.linkLabel ? (
                <Button asChild variant="link" className="mt-3 h-auto whitespace-normal px-0 text-left">
                  <Link to={section.to}>{section.linkLabel}<ArrowRight className="shrink-0" /></Link>
                </Button>
              ) : null}
            </section>
          ))}
        </Container>
      </Section>

      <Section>
        <Container className="max-w-3xl">
          <SectionHeading
            align="left"
            eyebrow="Cum apare o agenție în listă"
            title="Regulile listei, scrise explicit"
          />
          <ul className="mt-8 space-y-6">
            {partnerListingRules.map((rule) => (
              <li key={rule.title}>
                <h3 className="text-base font-semibold text-navy">{rule.title}</h3>
                <p className="mt-1 text-base leading-relaxed text-muted-foreground">{rule.text}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <FaqSection title="Întrebări despre lista agențiilor partenere" items={partnerAgenciesFaq} />

      <Section tone="muted" className="py-12 sm:py-14 lg:py-14">
        <Container className="max-w-3xl">
          <SectionHeading align="left" title="Continuă cu" />
          <nav aria-label="Continuă cu" className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {([
              { to: "/integrari", label: "Portaluri conectate" },
              { to: "/colaborare-intre-agentii", label: "Colaborare între agenții" },
              { to: "/preturi", label: "Prețuri" },
              { to: "/contact", label: "Contact" },
            ] as const).map((link) => (
              <Button key={link.to} asChild variant="link" className="h-auto whitespace-normal px-0 text-left">
                <Link to={link.to}>{link.label}<ArrowRight className="shrink-0" /></Link>
              </Button>
            ))}
          </nav>
        </Container>
      </Section>

      <CtaBand />
    </PublicLayout>
  );
}
