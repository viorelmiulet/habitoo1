import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { propertyStatusLabels, propertyStatusTone, requestKindLabels } from "@/lib/labels";
import { matchLabel, matchTone, scoreMatch } from "@/lib/matching";

export const Route = createFileRoute("/_authenticated/app/matching")({
  component: MatchingPage,
});

function MatchingPage() {
  const [minScore, setMinScore] = useState("70");

  const { data, isLoading } = useQuery({
    queryKey: ["matching"],
    queryFn: async () => {
      const [requests, properties] = await Promise.all([
        supabase.from("requests").select("*").eq("status", "active"),
        supabase.from("properties").select("*").in("status", ["active", "reserved", "negotiation"]),
      ]);
      return { requests: requests.data ?? [], properties: properties.data ?? [] };
    },
  });

  const groups = useMemo(() => {
    const threshold = Number(minScore);
    return (data?.requests ?? [])
      .map((request) => ({
        request,
        matches: (data?.properties ?? [])
          .map((property) => ({ property, match: scoreMatch(request, property) }))
          .filter((m) => m.match.score >= threshold)
          .sort((a, b) => b.match.score - a.match.score)
          .slice(0, 8),
      }))
      .filter((g) => g.matches.length > 0)
      .sort((a, b) => b.matches[0].match.score - a.matches[0].match.score);
  }, [data, minScore]);

  return (
    <>
      <PageHeader
        title="Matching automat"
        description="Cererile clienților confruntate în timp real cu portofoliul agenției."
        actions={
          <Select value={minScore} onValueChange={setMinScore}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="55">Scor minim 55%</SelectItem>
              <SelectItem value="70">Scor minim 70%</SelectItem>
              <SelectItem value="85">Scor minim 85%</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Se calculează potrivirile…</p>
      ) : groups.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Sparkles}
            title="Nicio potrivire la acest scor"
            description="Coboară scorul minim sau adaugă mai multe proprietăți și cereri active."
            action={
              <Button size="sm" asChild>
                <Link to="/app/requests">Vezi cererile</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ request, matches }) => (
            <div key={request.id} className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{request.title}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {requestKindLabels[request.kind]} ·{" "}
                    {formatMoney(request.budget_min, request.currency)} –{" "}
                    {formatMoney(request.budget_max, request.currency)} ·{" "}
                    {(request.cities ?? []).join(", ") || "orice oraș"}
                  </p>
                </div>
                <StatusBadge tone="primary">{matches.length} potriviri</StatusBadge>
              </div>
              <ul className="divide-y divide-border">
                {matches.map(({ property, match }) => (
                  <li key={property.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/app/properties/$id"
                        params={{ id: property.id }}
                        className="truncate font-medium hover:text-primary"
                      >
                        {property.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {match.reasons.join(" · ")}
                        {match.misses.length > 0 ? ` · lipsă: ${match.misses.join(", ")}` : ""}
                      </p>
                    </div>
                    <StatusBadge tone={propertyStatusTone[property.status]}>
                      {propertyStatusLabels[property.status]}
                    </StatusBadge>
                    <span className="w-28 text-right font-medium">
                      {formatMoney(property.price, property.currency)}
                    </span>
                    <StatusBadge tone={matchTone(match.score)}>
                      {match.score}% · {matchLabel(match.score)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
