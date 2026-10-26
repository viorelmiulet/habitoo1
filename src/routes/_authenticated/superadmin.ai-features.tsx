/**
 * Superadmin → Funcții AI: singurul loc din produs unde funcțiile AI se
 * activează sau se opresc, individual, per agenție. Implicit sunt toate oprite.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { EmptyState } from "@/components/app/EmptyState";
import { appHead } from "@/components/app/app-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { AI_FEATURES, type AiFeatureKey } from "@/lib/ai/features/keys";
import {
  listOrganizationAiFeatures,
  setOrganizationAiFeature,
  setOrganizationMediaLimits,
  type OrganizationAiFeatures,
} from "@/lib/ai/features/features.functions";

export const Route = createFileRoute("/_authenticated/superadmin/ai-features")({
  head: () => ({ ...appHead("Habitoo CRM — funcții AI per agenție"), meta: [...appHead("Habitoo CRM — funcții AI per agenție").meta, { name: "description", content: "Administrarea funcțiilor AI Habitoo pentru fiecare agenție, inclusiv narațiunea video în română." }, { property: "og:title", content: "Habitoo CRM — funcții AI per agenție" }, { property: "og:description", content: "Activarea individuală a funcțiilor AI pentru agenții." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SuperadminAiFeaturesPage,
});

function SuperadminAiFeaturesPage() {
  const loadFeatures = useServerFn(listOrganizationAiFeatures);
  const saveFeature = useServerFn(setOrganizationAiFeature);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["superadmin", "ai-features"],
    queryFn: () => loadFeatures(),
  });

  const mutation = useMutation({
    mutationFn: (input: { organizationId: string; featureKey: AiFeatureKey; enabled: boolean }) =>
      saveFeature({ data: input }),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "ai-features"] });
      void queryClient.invalidateQueries({ queryKey: ["ai-features"] });
      toast.success(input.enabled ? "Funcția a fost activată." : "Funcția a fost oprită.");
    },
    onError: (error: unknown) => toastError(error),
  });

  const organizations = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = query.data ?? [];
    return term ? rows.filter((row) => row.organizationName.toLowerCase().includes(term)) : rows;
  }, [query.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funcții AI"
        description="Toate funcțiile AI sunt oprite implicit. Activează-le individual, pentru fiecare agenție."
      />

      <div className="max-w-sm space-y-2">
        <Label htmlFor="ai-features-search">Caută agenție</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="ai-features-search"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Numele agenției"
          />
        </div>
      </div>

      {query.isLoading ? (
        <InlineLoading label="Se încarcă agențiile…" />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : organizations.length === 0 ? (
        <EmptyState icon={Sparkles} title="Nicio agenție" description="Nu am găsit agenții." />
      ) : (
        <div className="space-y-4">
          {organizations.map((org) => (
            <Card key={org.organizationId}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{org.organizationName}</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => {
                        for (const feature of AI_FEATURES) {
                          mutation.mutate({
                            organizationId: org.organizationId,
                            featureKey: feature.key,
                            enabled: true,
                          });
                        }
                      }}
                    >
                      Activează tot
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={mutation.isPending}
                      onClick={() => {
                        for (const feature of AI_FEATURES) {
                          mutation.mutate({
                            organizationId: org.organizationId,
                            featureKey: feature.key,
                            enabled: false,
                          });
                        }
                      }}
                    >
                      Oprește tot
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {AI_FEATURES.map((feature) => {
                  const enabled = org.features[feature.key] === true;
                  const id = `${org.organizationId}-${feature.key}`;
                  return (
                    <div
                      key={feature.key}
                      className="flex min-h-11 items-start justify-between gap-3 rounded-xl border border-border p-3"
                    >
                      <div className="min-w-0">
                        <Label htmlFor={id} className="text-sm font-medium">
                          {feature.label}
                        </Label>
                        <p className="mt-1 text-xs text-muted-foreground">{feature.description}</p>
                      </div>
                      <Switch
                        id={id}
                        checked={enabled}
                        disabled={mutation.isPending}
                        onCheckedChange={(checked) =>
                          mutation.mutate({
                            organizationId: org.organizationId,
                            featureKey: feature.key,
                            enabled: checked,
                          })
                        }
                      />
                    </div>
                  );
                })}
                <MediaLimitsEditor org={org} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaLimitsEditor({ org }: { org: OrganizationAiFeatures }) {
  const [limits, setLimits] = useState(org.mediaLimits);
  const save = useServerFn(setOrganizationMediaLimits);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (_input: void) => save({ data: { organizationId: org.organizationId, ...limits } }),
    onSuccess: () => {
      toast.success("Limitele Studio AI au fost salvate.");
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "ai-features"] });
      void queryClient.invalidateQueries({ queryKey: ["ai-media-status"] });
    },
    onError: toastError,
  });
  return <div className="space-y-3 border-t border-border pt-4 sm:col-span-2">
    <p className="text-sm font-semibold">Studio AI — limite lunare</p>
    <div className="grid gap-3 sm:grid-cols-3">
      {([['marketing_image', 'Imagini marketing'], ['photo_enhance', 'Îmbunătățiri poze'], ['photo_video', 'Video']] as const).map(([key, label]) => <div key={key} className="space-y-2">
        <Label htmlFor={`${org.organizationId}-limit-${key}`}>{label}</Label>
        <Input id={`${org.organizationId}-limit-${key}`} type="number" min={0} step={1} value={limits[key]} onChange={event => setLimits(previous => ({ ...previous, [key]: event.target.valueAsNumber }))} />
      </div>)}
    </div>
    <Button variant="outline" disabled={mutation.isPending || Object.values(limits).some(value => !Number.isInteger(value) || value < 0)} onClick={() => mutation.mutate()}>Salvează limitele</Button>
  </div>;
}
