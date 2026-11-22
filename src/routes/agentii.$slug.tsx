import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { publicHead } from "@/components/marketing/public-head";
import { ProfileOfferList } from "@/components/marketing/ProfileOfferList";
import { fetchAgencyPage } from "@/lib/public-profiles.functions";
import { partnerInitials } from "@/lib/public-partners";
import { agencyIndexable, agencyJsonLd, agencyPath, PROFILE_OFFERS_PAGE_SIZE } from "@/lib/marketing/agency-seo";

const FOOTER = "Agenții imobiliare care lucrează cu Habitoo CRM.";

export const Route = createFileRoute("/agentii/$slug")({
  validateSearch: (s: Record<string, unknown>): { pagina?: number } => { const n = Math.floor(Number(s["pagina"])); return n > 1 ? { pagina: n } : {}; },
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1 }),
  loader: async ({ params, deps }) => {
    const data = await fetchAgencyPage({ data: { slug: params.slug, page: deps.pagina } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return publicHead({ path: "/agentii", title: "Agenția nu a fost găsită | Habitoo CRM", description: "Pagina căutată nu există sau nu mai este disponibilă.", noindex: true });
    const { agency, offers } = loaderData;
    const where = agency.city ? ` din ${agency.city}` : "";
    return publicHead({
      path: agencyPath(agency.slug),
      title: `${agency.name}${where} — oferte imobiliare | Habitoo`,
      description: agency.description?.slice(0, 160) ?? `Ofertele imobiliare ale agenției ${agency.name}${where}.`,
      noindex: !agencyIndexable(agency) || offers.page > 1,
      jsonLd: agencyJsonLd(agency, offers.items, (offers.page - 1) * PROFILE_OFFERS_PAGE_SIZE),
    });
  },
  errorComponent: () => (
    <PublicLayout footerDescription={FOOTER}>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold text-navy">Agenția nu a putut fi încărcată.</h1>
        <Link to="/agentii" className="mt-4 inline-block text-sm font-semibold underline">Înapoi la lista agențiilor</Link>
      </div>
    </PublicLayout>
  ),
  notFoundComponent: () => (
    <PublicLayout footerDescription={FOOTER}>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold text-navy">Agenția nu a fost găsită.</h1>
        <p className="mt-2 text-muted-foreground">Pagina căutată nu există sau nu mai este disponibilă.</p>
        <Link to="/agentii" className="mt-4 inline-block text-sm font-semibold underline">Înapoi la lista agențiilor</Link>
      </div>
    </PublicLayout>
  ),
  component: AgencyProfilePage,
});

function AgencyProfilePage() {
  const { agency, offers } = Route.useLoaderData();
  return (
    <PublicLayout homeHeader footerDescription={FOOTER}>
      <section className="mk-page-hero border-b">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden ds-plate border p-2 sm:size-24">
              {agency.logoUrl ? <img src={agency.logoUrl} alt={`Logo ${agency.name}`} className="size-full object-contain" /> : (
                <span className="flex size-full items-center justify-center rounded-xl ds-plate-initials font-display text-3xl font-semibold" aria-hidden>{partnerInitials(agency.name)}</span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="break-words font-display text-4xl font-semibold text-navy sm:text-5xl">{agency.name}</h1>
              {agency.city ? <p className="mt-3 text-lg text-muted-foreground">{agency.city}</p> : null}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {agency.phone ? <a href={`tel:${agency.phone.replace(/\s+/g, "")}`} className="font-semibold underline">{agency.phone}</a> : null}
                {agency.email ? <a href={`mailto:${agency.email}`} className="font-semibold underline">{agency.email}</a> : null}
                {agency.website ? <a href={agency.website} rel="noopener nofollow" target="_blank" className="font-semibold underline">{agency.website.replace(/^https?:\/\//, "")}</a> : null}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto w-full max-w-7xl space-y-12 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {agency.description ? <p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed text-muted-foreground">{agency.description}</p> : null}
        <div className="space-y-5">
          <h2 className="font-display text-2xl font-semibold text-navy">Oferte ({offers.total})</h2>
          <ProfileOfferList offers={offers} pageHref={(p) => `${agencyPath(agency.slug)}${p > 1 ? `?pagina=${p}` : ""}`} />
        </div>
        <Link to="/agentii" className="inline-block text-sm font-semibold underline">Înapoi la lista agențiilor</Link>
      </section>
    </PublicLayout>
  );
}
