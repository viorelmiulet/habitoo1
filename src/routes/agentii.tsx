import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { publicHead, SITE_URL } from "@/components/marketing/public-head";
import { listPublicPartners } from "@/lib/public-partners.functions";
import { partnerInitials, type PublicPartner } from "@/lib/public-partners";

const TITLE = "Agenții partenere | Habitoo CRM";
const DESCRIPTION = "Agențiile imobiliare care lucrează cu Habitoo CRM.";

export const Route = createFileRoute("/agentii")({
  loader: () => listPublicPartners(),
  head: ({ loaderData }) => {
    const partners = loaderData ?? [];
    return publicHead({
      path: "/agentii",
      title: TITLE,
      description: DESCRIPTION,
      noindex: partners.length === 0,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Agenții partenere Habitoo",
        url: `${SITE_URL}/agentii`,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: partners.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name })),
        },
      },
    });
  },
  component: PartnersPage,
});

function PartnerCard({ partner }: { partner: PublicPartner }) {
  return (
    <li className="flex min-w-0 flex-col items-center gap-3 rounded-[22px] border border-border bg-card p-4 text-center shadow-soft sm:p-5">
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
    </li>
  );
}

function PartnersPage() {
  const partners = Route.useLoaderData();
  return (
    <PublicLayout homeHeader footerDescription="Agenții imobiliare care lucrează cu Habitoo CRM.">
      <section className="mk-hero-bg border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <h1 className="font-display text-4xl font-semibold text-navy sm:text-5xl">Agenții partenere Habitoo</h1>
          <p className="mt-4 text-lg text-muted-foreground">Agenții care lucrează cu Habitoo CRM.</p>
        </div>
      </section>
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {partners.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center">
            <h2 className="font-display text-2xl font-semibold text-navy">Lista agențiilor partenere va apărea în curând.</h2>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {partners.map((p) => <PartnerCard key={p.name + (p.logoUrl ?? "")} partner={p} />)}
          </ul>
        )}
      </section>
    </PublicLayout>
  );
}
