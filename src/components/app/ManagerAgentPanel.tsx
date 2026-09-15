/**
 * Panoul Habitoo Manager (Stage 17).
 *
 * Utilizatorul scrie ce are nevoie; managerul afișează planul, agentul și pasul
 * curent, statusul fiecărui pas, sursele folosite și rezultatul final. Orice
 * acțiune care schimbă date apare ca propunere și se execută doar după „Aprobă”.
 * Interfața nu vede providerul, cheile sau prompturile.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  decideManagerPlan,
  listManagerPlans,
  runManagerPlan,
  type ManagerDecisionResult,
  type ManagerRun,
  type ManagerTurn,
} from "@/lib/ai/agents/manager/manager-client";
import {
  listMarketingProperties,
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_SPECS,
  MARKETING_CONTENT_TYPES,
  MARKETING_CONTENT_TYPE_LABELS,
  type MarketingChannel,
  type MarketingContentType,
} from "@/lib/ai/agents/marketing/marketing-client";

const STATUS_LABELS: Record<string, string> = {
  pending: "În așteptare",
  running: "În lucru",
  completed: "Finalizat",
  failed: "Eșuat",
  blocked: "Blocat",
  awaiting_approval: "Așteaptă aprobare",
  skipped: "Sărit",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
  blocked: "destructive",
  awaiting_approval: "secondary",
  skipped: "outline",
};

const EXAMPLES = [
  "Analizează apartamentul HB-120 și pregătește-l pentru promovare",
  "Ce lead-uri necesită follow-up?",
  "Pregătește proprietatea pentru promovare, dar nu aplica nimic",
];

export function ManagerAgentPanel({ propertyId }: { propertyId?: string }) {
  const queryClient = useQueryClient();
  const start = useServerFn(runManagerPlan);
  const decide = useServerFn(decideManagerPlan);
  const fetchProperties = useServerFn(listMarketingProperties);
  const fetchPlans = useServerFn(listManagerPlans);

  const [request, setRequest] = useState("");
  const [selected, setSelected] = useState<string[]>(propertyId ? [propertyId] : []);
  const [channel, setChannel] = useState<MarketingChannel>("olx");
  const [contentType, setContentType] = useState<MarketingContentType>("listing");
  const [run, setRun] = useState<ManagerRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const properties = useQuery({
    queryKey: ["manager", "properties"],
    queryFn: () => fetchProperties(),
    enabled: !propertyId,
  });

  const plans = useQuery({
    queryKey: ["manager", "plans"],
    queryFn: () => fetchPlans(),
  });

  const ids = propertyId ? [propertyId] : selected;

  const runMutation = useMutation({
    mutationFn: () =>
      start({
        data: {
          request: request.trim(),
          propertyIds: ids,
          channel,
          contentType,
        },
      }) as Promise<ManagerTurn>,
    onSuccess: (result) => {
      setRun(result.run ?? null);
      setError(result.status === "ok" ? null : (result.message ?? "Planul nu a putut fi rulat."));
      void queryClient.invalidateQueries({ queryKey: ["manager", "plans"] });
    },
    onError: () => setError("Planul nu a putut fi rulat. Nicio dată nu a fost modificată."),
  });

  const decideMutation = useMutation({
    mutationFn: (approved: boolean) =>
      decide({ data: { runId: run!.id, approved } }) as Promise<ManagerDecisionResult>,
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRun(result.run);
      setError(null);
      if (result.run.approved === false) toast.info("Acțiune respinsă. Nimic nu s-a schimbat.");
      else if (result.run.execution?.ok) toast.success(result.run.execution.message);
      else if (result.run.execution) toast.error(result.run.execution.message);
      void queryClient.invalidateQueries({ queryKey: ["manager", "plans"] });
      void queryClient.invalidateQueries({ queryKey: ["marketing", "drafts", propertyId] });
      void queryClient.invalidateQueries({ queryKey: ["property"] });
    },
    onError: () => setError("Decizia nu a putut fi procesată. Nicio dată nu a fost modificată."),
  });

  const busy = runMutation.isPending || decideMutation.isPending;
  const approval = run?.status === "suspended" ? run.approval : null;
  const suspended = (plans.data ?? []).filter((item) => item.status === "suspended");

  function toggleProperty(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : prev.length >= 5
          ? prev
          : [...prev, id],
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Habitoo Manager</CardTitle>
          <p className="text-sm text-muted-foreground">
            Scrie ce ai nevoie. Managerul alege agenții potriviți, rulează pașii în ordine și îți
            arată exact ce a folosit. Valorile de evaluare vin doar din motorul ACP, iar nimic nu se
            salvează fără aprobarea ta.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="manager-request">Cererea ta</Label>
            <Textarea
              id="manager-request"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="Ex.: Analizează apartamentul HB-120 și pregătește-l pentru promovare"
              rows={3}
              disabled={busy}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {EXAMPLES.map((example) => (
                <Button
                  key={example}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRequest(example)}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>

          {propertyId ? null : (
            <div className="space-y-2">
              <Label>Proprietăți implicate (opțional, maximum 5)</Label>
              <div className="flex flex-wrap gap-2">
                {(properties.data ?? []).slice(0, 40).map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={selected.includes(option.id) ? "default" : "outline"}
                    disabled={busy}
                    onClick={() => toggleProperty(option.id)}
                  >
                    {option.label}
                    {option.city ? ` · ${option.city}` : ""}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Canal pentru texte</Label>
              <Select
                value={channel}
                onValueChange={(value) => setChannel(value as MarketingChannel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETING_CHANNELS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {MARKETING_CHANNEL_SPECS[item].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tip conținut</Label>
              <Select
                value={contentType}
                onValueChange={(value) => setContentType(value as MarketingContentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETING_CONTENT_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {MARKETING_CONTENT_TYPE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || request.trim() === ""}
              onClick={() => runMutation.mutate()}
            >
              {runMutation.isPending ? "Se rulează planul…" : "Rulează planul"}
            </Button>
            {run ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => setRun(null)}>
                Plan nou
              </Button>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {run ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{run.intentLabel}</CardTitle>
              <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>
                {run.status === "suspended"
                  ? "Așteaptă aprobare"
                  : run.status === "completed"
                    ? "Finalizat"
                    : run.status === "failed"
                      ? "Eșuat"
                      : "În lucru"}
              </Badge>
              {run.previewOnly ? <Badge variant="outline">Doar previzualizare</Badge> : null}
              {run.agents.map((agent) => (
                <Badge key={agent} variant="outline">
                  {agent}
                </Badge>
              ))}
            </div>
            {run.summary ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{run.summary}</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {run.steps.map((step) => (
                <div
                  key={step.id}
                  className={`rounded-lg border p-3 ${
                    step.id === run.currentStepId ? "border-primary/50 bg-muted/40" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">{step.title}</div>
                    <Badge variant={STATUS_VARIANTS[step.status] ?? "outline"}>
                      {STATUS_LABELS[step.status] ?? step.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {step.source ?? step.agent}
                    {step.tool ? ` · ${step.tool}` : ""}
                    {step.retryCount > 0 ? ` · reîncercări: ${step.retryCount}` : ""}
                  </p>
                  {step.errorMessage ? (
                    <p className="mt-1 text-xs text-destructive">{step.errorMessage}</p>
                  ) : null}
                </div>
              ))}
            </div>

            {run.notes.length > 0 ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium">De știut</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {run.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {run.sources.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Surse folosite: {run.sources.join(" · ")}
              </p>
            ) : null}

            {approval ? (
              <>
                <Separator />
                <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
                  <div>
                    <p className="text-sm font-medium">{approval.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Se execută doar după aprobarea ta.
                    </p>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {approval.changes.map((change) => (
                      <li key={change.label}>
                        <span className="font-medium">{change.label}:</span>{" "}
                        {change.from ? `${change.from} → ` : ""}
                        {change.to}
                      </li>
                    ))}
                  </ul>
                  {approval.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-muted-foreground">
                      {warning}
                    </p>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => decideMutation.mutate(true)}
                    >
                      Aprobă
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => decideMutation.mutate(false)}
                    >
                      Respinge
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {suspended.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Planuri care așteaptă decizia ta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suspended.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="text-sm">
                  <p className="font-medium">{item.intentLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.approval?.label ?? "Acțiune în așteptare"}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setRun(item)}>
                  Reia
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
