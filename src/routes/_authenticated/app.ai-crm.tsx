/**
 * AI CRM (Stage 14) — agentul care lucrează cu clienți, lead-uri, cereri și
 * proprietăți. Interfața trimite doar textul utilizatorului către server
 * functions; nu cunoaște providerul, cheia sau prompturile.
 *
 * Orice modificare de date apare mai întâi ca propunere, cu valoarea actuală și
 * valoarea nouă, și se execută doar după apăsarea butonului „Aprob”.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { AiFeatureGate } from "@/components/app/ai/AiFeatureGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  askCrmAgent,
  decideCrmAction,
  listCrmAgentRuns,
  type CrmAgentRun,
  type CrmAgentTurn,
} from "@/lib/ai/agents/crm/crm-client";

export const Route = createFileRoute("/_authenticated/app/ai-crm")({
  head: () => appHead("AI CRM — asistentul pentru clienți și lead-uri"),
  component: GatedCrmAgentPage,
});

const SUGGESTIONS = [
  { label: "Lead-uri fără follow-up", question: "Ce lead-uri nu au primit follow-up?" },
  { label: "Clienții mei activi", question: "Arată-mi clienții mei activi." },
  {
    label: "Matching clienți",
    question: "Ce proprietăți se potrivesc cererilor clienților mei activi?",
  },
  {
    label: "Proprietăți noi",
    question: "Ce proprietăți noi avem pentru clienții activi?",
  },
  { label: "Prioritățile mele", question: "Care sunt lead-urile mele prioritare azi?" },
  { label: "Activitatea de azi", question: "Cum arată activitatea de azi?" },
  {
    label: "Lead-uri din prospectare",
    question: "Arată-mi lead-urile provenite din prospectare în ultimele 7 zile.",
  },
];

type Entry = {
  role: "user" | "assistant";
  content: string;
  warnings?: string[];
  sources?: { label: string }[];
};

function ApprovalCard({
  run,
  onDecision,
  busy,
}: {
  run: CrmAgentRun;
  onDecision: (approved: boolean) => void;
  busy: boolean;
}) {
  const proposal = run.proposal;
  if (!proposal) return null;
  const isDraft = proposal.risk === "draft";
  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {isDraft ? "Ciornă propusă" : "Propunere de acțiune"}
          </Badge>
          <Badge variant="outline">Așteaptă aprobarea ta</Badge>
        </div>
        <CardTitle className="text-base">{run.proposalLabel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="text-muted-foreground">Entitate: </span>
          {proposal.entity.label}
        </p>
        {proposal.precondition ? (
          <p className="text-xs text-muted-foreground">
            {proposal.precondition.label}: {proposal.precondition.value}
          </p>
        ) : null}
        <div className="space-y-1">
          {proposal.changes.map((change) => (
            <p key={change.field}>
              <span className="text-muted-foreground">{change.label}: </span>
              {change.from ? (
                <>
                  <span className="line-through opacity-70">{change.from}</span>
                  {" → "}
                </>
              ) : null}
              <span className="font-medium">{change.to}</span>
            </p>
          ))}
        </div>
        {proposal.assigneeLabel ? (
          <p>
            <span className="text-muted-foreground">Responsabil: </span>
            {proposal.assigneeLabel}
          </p>
        ) : null}
        {proposal.dueAt ? (
          <p>
            <span className="text-muted-foreground">Termen: </span>
            {new Date(proposal.dueAt).toLocaleString("ro-RO")}
          </p>
        ) : null}
        <p className="text-muted-foreground">{proposal.reason}</p>
        {(proposal.warnings ?? []).map((warning) => (
          <p key={warning} className="text-xs text-muted-foreground">
            {warning}
          </p>
        ))}
        <Separator />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onDecision(false)}>
            Respinge
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onDecision(true)}>
            {busy ? "Se procesează…" : "Aprobă"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CrmAgentPage() {
  const queryClient = useQueryClient();
  const ask = useServerFn(askCrmAgent);
  const decide = useServerFn(decideCrmAction);
  const fetchRuns = useServerFn(listCrmAgentRuns);

  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, setPending] = useState<CrmAgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  const runs = useQuery({ queryKey: ["ai-crm", "runs"], queryFn: () => fetchRuns() });

  const askMutation = useMutation({
    mutationFn: (question: string) =>
      ask({ data: { question, leadId: null, contactId: null } }) as Promise<CrmAgentTurn>,
    onSuccess: (result) => {
      if (result.status === "ok") {
        setEntries((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.answer,
            warnings: result.warnings,
            sources: result.sources,
          },
        ]);
        setPending(result.run?.status === "suspended" ? result.run : null);
        setError(null);
      } else {
        setError(result.message ?? "Asistentul nu a putut răspunde. Încearcă din nou.");
      }
      void queryClient.invalidateQueries({ queryKey: ["ai-crm", "runs"] });
    },
    onError: () =>
      setError(
        "Serviciul AI nu a putut finaliza analiza. Datele CRM nu au fost modificate.",
      ),
  });

  const decideMutation = useMutation({
    mutationFn: (approved: boolean) =>
      decide({ data: { runId: pending!.id, approved } }) as Promise<
        { ok: true; run: CrmAgentRun } | { ok: false; message: string }
      >,
    onSuccess: (result) => {
      if (result.ok) {
        // Etichetăm explicit rezultatul: aprobată, respinsă, eșuată sau blocată.
        const rejected = result.run.approved === false;
        const execution = result.run.execution;
        const prefix = rejected
          ? "Acțiune respinsă"
          : execution?.ok === true
            ? "Acțiune aprobată"
            : execution?.code === "denied" || execution?.code === "invalid_input"
              ? "Acțiune blocată"
              : execution
                ? "Acțiune eșuată"
                : "Acțiune procesată";
        setEntries((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `${prefix}: ${
              execution?.message ??
              (rejected ? "nicio dată nu a fost modificată." : "acțiunea a fost procesată.")
            }`,
          },
        ]);
        setPending(null);
        setError(null);
      } else {
        setError(result.message);
        setPending(null);
      }
      void queryClient.invalidateQueries({ queryKey: ["ai-crm", "runs"] });
    },
    onError: () => setError("Acțiunea nu a putut fi procesată. Datele CRM nu au fost modificate."),
  });

  const busy = askMutation.isPending || decideMutation.isPending;

  function submit(question: string) {
    const text = question.trim();
    if (text === "" || busy) return;
    setEntries((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLastQuestion(text);
    askMutation.mutate(text);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI CRM"
        description="Întreabă despre clienți, lead-uri, cereri și potriviri. Orice modificare se face doar după aprobarea ta."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion.label}
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => submit(suggestion.question)}
                >
                  {suggestion.label}
                </Button>
              ))}
            </div>

            <div className="space-y-3">
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Exemple: „Ce lead-uri nu au mai fost contactate de 7 zile?”, „Arată-mi clienții
                  care caută apartament cu 2 camere în Militari”, „Creează follow-up pentru primul
                  lead mâine”.
                </p>
              ) : (
                entries.map((entry, index) => (
                  <div
                    key={`${entry.role}-${index}`}
                    className={
                      entry.role === "user"
                        ? "rounded-md bg-muted p-3 text-sm"
                        : "rounded-md border p-3 text-sm"
                    }
                  >
                    <p className="mb-1 text-xs uppercase text-muted-foreground">
                      {entry.role === "user" ? "Tu" : "AI CRM"}
                    </p>
                    <p className="whitespace-pre-wrap">{entry.content}</p>
                    {(entry.sources ?? []).length > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {(entry.sources ?? []).length} înregistrări din CRM folosite
                      </p>
                    ) : null}
                    {(entry.warnings ?? []).map((warning) => (
                      <Badge key={warning} variant="secondary" className="mr-2 mt-2">
                        {warning}
                      </Badge>
                    ))}
                  </div>
                ))
              )}

              {askMutation.isPending ? (
                <p className="text-sm text-muted-foreground">AI CRM analizează datele agenției…</p>
              ) : null}

              {pending ? (
                <ApprovalCard
                  run={pending}
                  busy={decideMutation.isPending}
                  onDecision={(approved) => decideMutation.mutate(approved)}
                />
              ) : null}

              {error ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-destructive">{error}</p>
                  {lastQuestion ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setError(null);
                        askMutation.mutate(lastQuestion);
                      }}
                    >
                      Încearcă din nou
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Întreabă-mă despre clienți, lead-uri sau proprietăți..."
                rows={3}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit(input);
                  }
                }}
              />
              <div className="flex justify-end">
                <Button onClick={() => submit(input)} disabled={busy || input.trim() === ""}>
                  {askMutation.isPending ? "Se trimite…" : "Trimite"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Istoric cereri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(runs.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">Nicio cerere înregistrată încă.</p>
            ) : (
              (runs.data ?? []).map((run) => (
                <div key={run.id} className="space-y-1 border-b pb-2 last:border-0">
                  <p className="truncate font-medium">{run.question}</p>
                  <p className="text-xs text-muted-foreground">
                    {run.status === "suspended"
                      ? "Așteaptă aprobare"
                      : run.status === "completed"
                        ? "Finalizată"
                        : run.status === "failed"
                          ? "Eșuată"
                          : "În lucru"}
                    {run.proposalLabel ? ` · ${run.proposalLabel}` : ""}
                  </p>
                  {run.status === "suspended" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setPending(run)}
                    >
                      Vezi propunerea
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Funcțiile AI sunt activate individual per agenție de administratorul platformei. */
function GatedCrmAgentPage() {
  return (
    <AiFeatureGate feature="ai_crm">
      <CrmAgentPage />
    </AiFeatureGate>
  );
}
