/**
 * Flux de lucru Habitoo AI cu aprobare umană.
 *
 * Agentul propune o citire, fluxul se suspendă, iar utilizatorul aprobă sau
 * respinge. Starea este salvată pe server, deci rămâne intactă la reîncărcare.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  listAiWorkflows,
  resumeAiWorkflow,
  startAiWorkflow,
  type AiWorkflowRun,
} from "@/lib/ai/ai-client";

const STATUS_LABEL: Record<string, string> = {
  running: "În desfășurare",
  suspended: "Așteaptă aprobarea ta",
  completed: "Finalizat",
  failed: "Eșuat",
};

export function AiWorkflowCard({ propertyId = null }: { propertyId?: string | null }) {
  const queryClient = useQueryClient();
  const fetchRuns = useServerFn(listAiWorkflows);
  const start = useServerFn(startAiWorkflow);
  const resume = useServerFn(resumeAiWorkflow);

  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const runs = useQuery({ queryKey: ["ai", "workflows"], queryFn: () => fetchRuns() });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["ai", "workflows"] });
  }

  const startMutation = useMutation({
    mutationFn: (value: string) => start({ data: { question: value, propertyId } }),
    onSuccess: (result) => {
      setError(result.ok ? null : result.message);
      if (result.ok) setQuestion("");
      refresh();
    },
    onError: () => setError("Fluxul nu a putut fi pornit. Încearcă din nou."),
  });

  const resumeMutation = useMutation({
    mutationFn: (input: { runId: string; approved: boolean }) => resume({ data: input }),
    onSuccess: (result) => {
      setError(result.ok ? null : result.message);
      refresh();
    },
    onError: () => setError("Decizia nu a putut fi trimisă. Încearcă din nou."),
  });

  const busy = startMutation.isPending || resumeMutation.isPending;
  const list: AiWorkflowRun[] = runs.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Flux cu aprobare</CardTitle>
        <CardDescription>
          Habitoo AI propune ce date să citească, iar tu aprobi înainte de execuție. Fluxul se
          reia din același punct chiar dacă închizi pagina.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ex.: verifică apartamentele din Cluj"
            maxLength={200}
          />
          <Button
            onClick={() => question.trim() !== "" && startMutation.mutate(question.trim())}
            disabled={busy || question.trim() === ""}
          >
            {startMutation.isPending ? "Se pornește…" : "Pornește fluxul"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nu ai fluxuri pornite.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((run) => (
              <li key={run.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{run.question || "Flux de diagnostic"}</span>
                  <Badge variant={run.status === "suspended" ? "default" : "secondary"}>
                    {STATUS_LABEL[run.status] ?? run.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Pas curent: {run.currentStep}</p>
                {run.contextUsed.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Context folosit: {run.contextUsed.join(", ")}
                  </p>
                ) : null}

                {run.status === "suspended" && run.proposal ? (
                  <div className="mt-3 space-y-2 rounded-md bg-muted p-3">
                    <p>{run.proposal.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      Acțiune propusă: citire ({run.proposal.tool}). Nu modifică nimic.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          resumeMutation.mutate({ runId: run.id, approved: true })
                        }
                      >
                        Aprob
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          resumeMutation.mutate({ runId: run.id, approved: false })
                        }
                      >
                        Resping
                      </Button>
                    </div>
                  </div>
                ) : null}

                {run.answer ? <p className="mt-2">{run.answer}</p> : null}
                {run.notes.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{run.notes.join(" ")}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
