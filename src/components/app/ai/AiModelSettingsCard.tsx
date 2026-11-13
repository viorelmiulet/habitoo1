import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { getAiModelSettings, saveAiModelSettings, testAiModel } from "@/lib/ai/models.functions";
import type { AiModelSlot } from "@/lib/ai/providers/models";

const FIELDS: { slot: AiModelSlot; label: string; hint: string }[] = [
  { slot: "fast", label: "Model rapid (Gemini)", hint: "Clasificare, extragere de date, răspunsuri scurte, scoruri." },
  { slot: "standard", label: "Model standard (Gemini)", hint: "Agenții CRM, Manager și Marketing, descrieri, ACP AI, imagini." },
  { slot: "fallback", label: "Model rezervă (Mistral)", hint: "Folosit doar când Gemini este temporar indisponibil." },
];

export function AiModelSettingsCard() {
  const load = useServerFn(getAiModelSettings);
  const save = useServerFn(saveAiModelSettings);
  const test = useServerFn(testAiModel);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["superadmin", "ai-models"], queryFn: () => load() });
  const [values, setValues] = useState<Record<AiModelSlot, string>>({ fast: "", standard: "", fallback: "" });
  const [results, setResults] = useState<Partial<Record<AiModelSlot, { ok: boolean; message: string }>>>({});
  const [testing, setTesting] = useState<AiModelSlot | null>(null);

  useEffect(() => {
    if (query.data) setValues(query.data.saved);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () => save({ data: values }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "ai-models"] });
      toast.success("Modelele AI au fost salvate.");
    },
    onError: (error: unknown) => toastError(error),
  });

  async function runTest(slot: AiModelSlot) {
    setTesting(slot);
    try {
      const result = await test({ data: { slot, model: values[slot] } });
      setResults((prev) => ({ ...prev, [slot]: result }));
    } catch (error) {
      toastError(error);
    } finally {
      setTesting(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modele AI</CardTitle>
        <p className="text-sm text-muted-foreground">
          Google Gemini este furnizorul principal, iar Mistral rezerva. Un câmp gol folosește modelul implicit.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <InlineLoading label="Se încarcă modelele…" />
        ) : query.isError ? (
          <QueryError error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data ? (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant={query.data.geminiConfigured ? "default" : "secondary"}>
                Gemini · {query.data.geminiConfigured ? "configurat" : "neconfigurat"}
              </Badge>
              <Badge variant={query.data.mistralConfigured ? "default" : "secondary"}>
                Mistral (rezervă) · {query.data.mistralConfigured ? "configurat" : "neconfigurat"}
              </Badge>
            </div>
            {FIELDS.map((field) => {
              const result = results[field.slot];
              return (
                <div key={field.slot} className="space-y-1">
                  <Label htmlFor={`ai-model-${field.slot}`}>{field.label}</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id={`ai-model-${field.slot}`}
                      value={values[field.slot]}
                      placeholder={query.data.defaults[field.slot]}
                      onChange={(event) => setValues((prev) => ({ ...prev, [field.slot]: event.target.value }))}
                    />
                    <Button
                      variant="outline"
                      disabled={testing !== null}
                      onClick={() => void runTest(field.slot)}
                    >
                      {testing === field.slot ? "Se testează…" : "Testează"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                  {result ? (
                    <p className={result.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{result.message}</p>
                  ) : null}
                </div>
              );
            })}
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Se salvează…" : "Salvează modelele"}
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
