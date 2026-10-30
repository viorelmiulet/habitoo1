import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Mail, MessageCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import { formatMoney } from "@/lib/format";
import { matchLabel, matchTone } from "@/lib/matching";
import { computeLeadMatches, LEAD_MATCH_STATUSES, type LeadMatch } from "@/lib/lead-matching";
import { brandingFromOrg, materialSignature } from "@/lib/materials";

type Lead = Tables<"leads">;

export function useLeadMatches(lead: Lead | null, orgId: string | undefined) {
  return useQuery({
    queryKey: ["lead-matches", lead?.id, lead?.property_id, orgId],
    enabled: Boolean(lead && orgId),
    queryFn: async (): Promise<{ source: Tables<"properties"> | null; matches: LeadMatch[] }> => {
      if (!lead?.property_id) return { source: null, matches: [] };
      const { data: source, error } = await supabase
        .from("properties").select("*").eq("id", lead.property_id).maybeSingle();
      if (error) throw error;
      if (!source) return { source: null, matches: [] };
      const { data: candidates, error: e2 } = await supabase
        .from("properties").select("*")
        .eq("organization_id", orgId as string)
        .eq("transaction_kind", source.transaction_kind)
        .in("status", [...LEAD_MATCH_STATUSES])
        .order("created_at", { ascending: false })
        .limit(500);
      if (e2) throw e2;
      return { source, matches: computeLeadMatches(source, candidates ?? []) };
    },
  });
}

export function LeadMatchesPanel({
  lead,
  data,
  isLoading,
  organization,
}: {
  lead: Lead;
  data: { source: Tables<"properties"> | null; matches: LeadMatch[] } | undefined;
  isLoading: boolean;
  organization: Parameters<typeof brandingFromOrg>[0];
}) {
  if (isLoading) return <InlineLoading />;
  if (!data?.source) return <p className="text-xs text-muted-foreground">Lead-ul nu are o proprietate asociată.</p>;
  if (data.matches.length === 0)
    return <p className="text-xs text-muted-foreground">Nicio proprietate cu potrivire de cel puțin 60%.</p>;
  const signature = materialSignature(brandingFromOrg(organization));
  return (
    <ul className="space-y-2">
      {data.matches.map(({ property: p, match }) => {
        const text = `Bună! Am o proprietate care s-ar putea potrivi: ${p.title}, preț ${formatMoney(
          p.price,
          p.currency,
        )}, în ${p.city ?? "—"}, ${p.rooms ?? "—"} camere, ${p.surface ?? "—"} mp.

${signature}`;
        const phone = (lead.phone ?? "").replace(/[^0-9]/g, "");
        return (
          <li key={p.id} className="rounded-md border border-border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">{p.reference}</p>
                <p className="truncate font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(p.price, p.currency)} · {p.rooms ?? "—"} cam. · {p.surface ?? "—"} mp
                  {p.district ? ` · ${p.district}` : ""}
                </p>
              </div>
              <StatusBadge tone={matchTone(match.score)}>
                {match.score}% · {matchLabel(match.score)}
              </StatusBadge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {match.reasons.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                  <Check className="size-3" aria-hidden /> {r}
                </span>
              ))}
              {match.misses.map((m) => (
                <span key={m} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <X className="size-3" aria-hidden /> {m}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" asChild>
                <Link to="/app/properties/$id" params={{ id: p.id }}>
                  <ExternalLink className="mr-1 size-3.5" /> Deschide proprietatea
                </Link>
              </Button>
              {phone ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-1 size-3.5" /> WhatsApp
                  </a>
                </Button>
              ) : null}
              {lead.email ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={`mailto:${lead.email}?subject=${encodeURIComponent(`Proprietate potrivită: ${p.title}`)}&body=${encodeURIComponent(text)}`}>
                    <Mail className="mr-1 size-3.5" /> Email
                  </a>
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
