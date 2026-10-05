import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { publicHead, SITE_URL } from "@/components/marketing/public-head";
import { fetchAgencyProfile } from "@/lib/public-partners.functions";
import { partnerInitials, type PublicAgencyAgent } from "@/lib/public-partners";

export const Route = createFileRoute("/agentii/$slug")({
  loader: async ({ params }) => {
    const profile = await fetchAgencyProfile({ data: { slug: params.slug } });
    if (!profile) throw notFound();
    return profile;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return publicHead({
        path: "/agentii",
        title: "Agenția nu a fost găsită | Habitoo CRM",
        description: "Pagina căutată nu există sau nu mai este disponibilă.",
        noindex: true,
      });
    }
    const { agency } = loaderData;
    const title = `${agency.name} | Habitoo CRM`;
    const description =
      agency.description ?? `Agenția imobiliară ${agency.name}, parteneră Habitoo CRM.`;
    return publicHead({
      path: `/agentii/${agency.slug}`,
      title,
      description,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: agency.name,
        url: `${SITE_URL}/agentii/${agency.slug}`,
        ...(agency.description ? { description: agency.description } : {}),
      },
    });
  },
  errorComponent: () => (
    <PublicLayout footerDescription="Agenții imobiliare care lucrează cu Habitoo CRM.">
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold text-navy">Agenția nu a putut fi încărcată.</h1>
        <Link to="/agentii" className="mt-4 inline-block text-sm font-semibold text-accent-foreground underline">
          Înapoi la lista agențiilor
        </Link>
      </div>
    </PublicLayout>
  ),
  notFoundComponent: () => (
    <PublicLayout footerDescription="Agenții imobiliare care lucrează cu Habitoo CRM.">
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold text-navy">Agenția nu a fost găsită.</h1>
        <p className="mt-2 text-muted-foreground">Pagina căutată nu există sau nu mai este disponibilă.</p>
        <Link to="/agentii" className="mt-4 inline-block text-sm font-semibold text-accent-foreground underline">
          Înapoi la lista agențiilor
        </Link>
      </div>
    </PublicLayout>
  ),
  component: AgencyProfilePage,
});

function AgentCard({ agent }: { agent: PublicAgencyAgent }) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-border bg-card p-5 shadow-soft">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold-tint font-display text-sm font-semibold text-accent-foreground"
          aria-hidden
        >
          {partnerInitials(agent.fullName)}
        </span>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-navy">{agent.fullName}</p>
          {agent.jobTitle ? (
            <p className="truncate text-xs text-muted-foreground">{agent.jobTitle}</p>
          ) : null}
        </div>
      </div>
      {agent.bio ? <p className="break-words text-sm text-muted-foreground">{agent.bio}</p> : null}
      {agent.phone ? (
        <a
          href={`tel:${agent.phone.replace(/\s+/g, "")}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent-foreground underline"
        >
          {agent.phone}
        </a>
      ) : null}
    </li>
  );
}

function AgencyProfilePage() {
  const { agency, agents } = Route.useLoaderData();
  return (
    <PublicLayout homeHeader footerDescription="Agenții imobiliare care lucrează cu Habitoo CRM.">
      <section className="mk-hero-bg border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background p-2 sm:size-24">
              {agency.logoUrl ? (
                <img src={agency.logoUrl} alt={`Logo ${agency.name}`} className="size-full object-contain" />
              ) : (
                <span
                  className="flex size-full items-center justify-center rounded-xl bg-gold-tint font-display text-3xl font-semibold text-accent-foreground"
                  aria-hidden
                >
                  {partnerInitials(agency.name)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="break-words font-display text-4xl font-semibold text-navy sm:text-5xl">{agency.name}</h1>
              <p className="mt-3 text-lg text-muted-foreground">Agenție imobiliară parteneră Habitoo CRM.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="max-w-3xl space-y-10">
          {agency.description ? (
            <p className="whitespace-pre-line text-lg leading-relaxed text-muted-foreground">{agency.description}</p>
          ) : null}
          <div className="space-y-5">
            <h2 className="font-display text-2xl font-semibold text-navy">Agenți</h2>
            {agents.length === 0 ? (
              <p className="text-muted-foreground">Niciun agent publicat încă.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {agents.map((agent) => (
                  <AgentCard key={agent.fullName} agent={agent} />
                ))}
              </ul>
            )}
          </div>
          <Link to="/agentii" className="inline-block text-sm font-semibold text-accent-foreground underline">
            Înapoi la lista agențiilor
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
