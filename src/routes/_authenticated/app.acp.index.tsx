import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, PlusCircle } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { CardGridSkeleton } from "@/components/app/LoadingState";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { appHead } from "@/components/app/app-head";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/acp/")({
  head: () => appHead("Habitoo CRM — analize comparative de piață"),
  component: AcpListPage,
});

const STATUS_LABELS: Record<string, string> = {
  draft: "Ciornă",
  running: "În calcul",
  completed: "Finalizată",
  archived: "Arhivată",
};

function AcpListPage() {
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id ?? null;

  const { data: analyses, isLoading } = useQuery({
    queryKey: ["acp-analyses", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acp_analyses")
        .select("id,title,status,comparables_count,estimated_value,created_at,median_price_per_sqm")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ACP"
        title="Analize salvate"
        description="Analizele comparative de piață create în agenția ta, cu comparabilele și scorurile păstrate pentru transparență."
        actions={
          <Button asChild>
            <Link to="/app/acp/new">
              <PlusCircle className="size-4" /> Analiză nouă
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <CardGridSkeleton />
      ) : (analyses ?? []).length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nicio analiză încă"
          description="Creează prima analiză comparativă pentru a estima valoarea unei proprietăți pe baza pieței."
          action={
            <Button asChild>
              <Link to="/app/acp/new">Analiză nouă</Link>
            </Button>
          }
        />
      ) : (
        <SectionCard title="Analize" icon={BarChart3} flush>
          <ul className="divide-y divide-border">
            {(analyses ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString("ro-RO")} ·{" "}
                    {a.comparables_count} comparabile
                    {a.median_price_per_sqm
                      ? ` · median ${formatMoney(a.median_price_per_sqm, "EUR")}/mp`
                      : ""}
                  </p>
                </div>
                {a.estimated_value ? (
                  <span className="text-sm font-semibold">
                    {formatMoney(a.estimated_value, "EUR")}
                  </span>
                ) : null}
                <StatusBadge tone={a.status === "completed" ? "success" : "neutral"}>
                  {STATUS_LABELS[a.status] ?? a.status}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
