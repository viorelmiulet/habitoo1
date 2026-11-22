import { Link } from "@tanstack/react-router";
import type { PublicOfferAgent } from "@/lib/public-offer.functions";
import { partnerInitials } from "@/lib/public-partners";

/** „Agent” card on the public offer page; server-rendered. Hidden/inactive/unassigned agents show only the agency. Never shows an email. */
export function OfferAgentCard({ agent, agencyName, agencyLogoUrl, agencyContacts }: { agent: PublicOfferAgent; agencyName: string; agencyLogoUrl: string | null; agencyContacts: string[] }) {
  const agencyLabel = agent.agencySlug
    ? <Link to="/agentii/$slug" params={{ slug: agent.agencySlug }} className="font-semibold underline">{agencyName}</Link>
    : <span className="font-semibold">{agencyName}</span>;
  const phone = agent.phone;
  return (
    <section aria-labelledby="offer-agent" className="rounded-xl border border-border bg-card p-5" data-testid="offer-agent-card">
      <h2 id="offer-agent" className="mb-4 text-lg font-semibold">Agent</h2>
      <div className="flex items-center gap-4">
        {agent.fullName ? (
          agent.avatarUrl
            ? <img src={agent.avatarUrl} alt={agent.fullName} className="size-16 shrink-0 rounded-full object-cover" loading="lazy" />
            : <span className="flex size-16 shrink-0 items-center justify-center rounded-full ds-plate-initials text-lg font-semibold" aria-hidden>{partnerInitials(agent.fullName)}</span>
        ) : agencyLogoUrl ? (
          <img src={agencyLogoUrl} alt={agencyName} className="max-h-14 w-auto max-w-40 shrink-0 object-contain" loading="lazy" />
        ) : null}
        <div className="min-w-0 space-y-1 text-sm">
          {agent.fullName ? <p className="text-base font-semibold text-foreground">{agent.fullName}</p> : null}
          <p className="text-muted-foreground">{agencyLabel}</p>
          {phone ? <a href={`tel:${phone.replace(/\s+/g, "")}`} className="inline-block font-semibold underline">{phone}</a> : null}
          {!agent.fullName && agencyContacts.length ? <p className="text-muted-foreground">{agencyContacts.filter((c) => c !== phone).join(" · ")}</p> : null}
        </div>
      </div>
    </section>
  );
}
