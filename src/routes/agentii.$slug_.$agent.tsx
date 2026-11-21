import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { publicHead } from "@/components/marketing/public-head";
import { ProfileOfferList } from "@/components/marketing/ProfileOfferList";
import { fetchAgentPage } from "@/lib/public-profiles.functions";
import { partnerInitials } from "@/lib/public-partners";
import { agentIndexable, agentJsonLd, agentPath, PROFILE_OFFERS_PAGE_SIZE } from "@/lib/marketing/agency-seo";

const FOOTER = "Agenți imobiliari care lucrează cu Habitoo CRM.";

export const Route = createFileRoute("/agentii/$slug_/$agent")({
  validateSearch: (s: Record<string, unknown>): { pagina?: number } => { const n = Math.floor(Number(s["pagina"])); return n > 1 ? { pagina: n } : {}; },
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1 }),
  loader: async ({ params, deps }) => {
    const data = await fetchAgentPage({ data: { slug: params.slug, agent: params.agent, page: deps.pagina } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return publicHead({ path: "/agentii", title: "Agentul nu a fost găsit | Habitoo CRM", description: "Pagina căutată nu există sau nu mai este disponibilă.", noindex: true });
    const { agency, agent, offers } = loaderData;
    return publicHead({
      path: agentPath(agency.slug, agent.slug),
      title: `${agent.fullName}, agent ${agency.name} | Habitoo`,
      description: agent.bio?.slice(0, 160) ?? `Ofertele imobiliare ale agentului ${agent.fullName} de la ${agency.name}.`,
      noindex: !agentIndexable({ isActive: agent.isActive, agencyCurrentAccess: agency.currentAccess, offerCount: agent.offerCount }) || offers.page > 1,
      jsonLd: agentJsonLd(agency, { ...agent, imageUrl: agent.avatarUrl }, offers.items, (offers.page - 1) * PROFILE_OFFERS_PAGE_SIZE),
    });
  },
  errorComponent: () => (
    <PublicLayout footerDescription={FOOTER}>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold text-navy">Profilul nu a putut fi încărcat.</h1>
        <Link to="/agentii" className="mt-4 inline-block text-sm font-semibold underline">Înapoi la lista agențiilor</Link>
      </div>
    </PublicLayout>
  ),
  notFoundComponent: () => (
    <PublicLayout footerDescription={FOOTER}>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold text-navy">Agentul nu a fost găsit.</h1>
        <Link to="/agentii" className="mt-4 inline-block text-sm font-semibold underline">Înapoi la lista agențiilor</Link>
      </div>
    </PublicLayout>
  ),
  component: AgentProfilePage,
});

function AgentProfilePage() {
  const { agency, agent, offers } = Route.useLoaderData();
  return (
    <PublicLayout homeHeader footerDescription={FOOTER}>
      <section className="mk-page-hero border-b">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:px-6 sm:py-20 lg:px-8">
          {agent.avatarUrl ? <img src={agent.avatarUrl} alt={agent.fullName} className="size-24 rounded-full object-cover" /> : (
            <span className="flex size-24 shrink-0 items-center justify-center rounded-full ds-plate-initials font-display text-3xl font-semibold" aria-hidden>{partnerInitials(agent.fullName)}</span>
          )}
          <div className="min-w-0">
            <h1 className="break-words font-display text-4xl font-semibold text-navy sm:text-5xl">{agent.fullName}</h1>
            <p className="mt-3 text-lg text-muted-foreground">
              {agent.jobTitle ? `${agent.jobTitle}, ` : "Agent la "}
              <Link to="/agentii/$slug" params={{ slug: agency.slug }} className="font-semibold underline">{agency.name}</Link>
            </p>
            {agent.phone ? <a href={`tel:${agent.phone.replace(/\s+/g, "")}`} className="mt-2 inline-block text-sm font-semibold underline">{agent.phone}</a> : null}
          </div>
        </div>
      </section>
      <section className="mx-auto w-full max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {agent.bio ? <p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed text-muted-foreground">{agent.bio}</p> : null}
        <div className="space-y-5">
          <h2 className="font-display text-2xl font-semibold text-navy">Oferte ({offers.total})</h2>
          <ProfileOfferList offers={offers} pageHref={(p) => `${agentPath(agency.slug, agent.slug)}${p > 1 ? `?pagina=${p}` : ""}`} />
        </div>
      </section>
    </PublicLayout>
  );
}
