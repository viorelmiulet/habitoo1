/**
 * Panoul Marketing Agent (Stage 16), refolosit în pagina proprietății și în
 * zona AI. Interfața trimite doar opțiuni și ID-uri către server functions:
 * nu cunoaște providerul, cheile sau prompturile.
 *
 * Generarea este preview. Salvarea ciornei și aplicarea textului pe proprietate
 * apar ca propuneri și se execută doar după apăsarea butonului „Aprobă”.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  decideMarketingAction,
  generateMarketing,
  listMarketingProperties,
  listPropertyMarketingDrafts,
  proposeMarketingAction,
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_SPECS,
  MARKETING_CONTENT_TYPES,
  MARKETING_CONTENT_TYPE_LABELS,
  MARKETING_LENGTHS,
  MARKETING_LENGTH_LABELS,
  MARKETING_TONES,
  MARKETING_TONE_LABELS,
  type MarketingChannel,
  type MarketingContentType,
  type MarketingDecisionResult,
  type MarketingLength,
  type MarketingRun,
  type MarketingTone,
  type MarketingTurn,
} from "@/lib/ai/agents/marketing/marketing-client";

const VALIDATION_LABELS: Record<string, string> = {
  valid: "Verificat factual",
  warning: "Verificat cu observații",
  invalid: "Neconform — regenerează",
};

export function MarketingAgentPanel({
  propertyId,
  allowPropertyPicker = false,
}: {
  propertyId?: string;
  allowPropertyPicker?: boolean;
}) {
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMarketing);
  const propose = useServerFn(proposeMarketingAction);
  const decide = useServerFn(decideMarketingAction);
  const fetchProperties = useServerFn(listMarketingProperties);
  const fetchDrafts = useServerFn(listPropertyMarketingDrafts);

  const [channel, setChannel] = useState<MarketingChannel>("olx");
  const [contentType, setContentType] = useState<MarketingContentType>("listing");
  const [tone, setTone] = useState<MarketingTone>("professional");
  const [length, setLength] = useState<MarketingLength>("standard");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>(propertyId ? [propertyId] : []);
  const [run, setRun] = useState<MarketingRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const properties = useQuery({
    queryKey: ["marketing", "properties"],
    queryFn: () => fetchProperties(),
    enabled: allowPropertyPicker,
  });

  const drafts = useQuery({
    queryKey: ["marketing", "drafts", propertyId],
    queryFn: () => fetchDrafts({ data: { propertyId: propertyId! } }),
    enabled: Boolean(propertyId),
  });


  const ids = propertyId ? [propertyId] : selected;

  const generateMutation = useMutation({
    mutationFn: () =>
      generate({
        data: {
          propertyIds: ids,
          channel,
          contentType,
          tone,
          length,
          notes: notes.trim() === "" ? null : notes.trim(),
        },
      }) as Promise<MarketingTurn>,
    onSuccess: (result) => {
      if (result.status === "ok" && result.run) {
        setRun(result.run);
        setError(null);
      } else {
        setRun(result.run ?? null);
        setError(result.message ?? "Conținutul nu a putut fi generat. Încearcă din nou.");
      }
      void queryClient.invalidateQueries({ queryKey: ["marketing", "runs"] });
    },
    onError: () =>
      setError("Serviciul AI nu a putut genera textul. Nicio dată nu a fost modificată."),
  });

  const proposeMutation = useMutation({
    mutationFn: (input: { resultIndex: number; mode: "save_draft" | "apply_to_property" }) =>
      propose({
        data: {
          runId: run!.id,
          resultIndex: input.resultIndex,
          mode: input.mode,
          draftId: run!.results[input.resultIndex]?.draftId ?? null,
        },
      }) as Promise<MarketingDecisionResult>,
    onSuccess: (result) => {
      if (result.ok) {
        setRun(result.run);
        setError(null);
      } else {
        setError(result.message);
      }
    },
    onError: () => setError("Propunerea nu a putut fi pregătită. Încearcă din nou."),
  });

  const decideMutation = useMutation({
    mutationFn: (approved: boolean) =>
      decide({ data: { runId: run!.id, approved } }) as Promise<MarketingDecisionResult>,
    onSuccess: (result) => {
      if (result.ok) {
        setRun(result.run);
        setError(null);
        const execution = result.run.execution;
        if (result.run.approved === false) toast.info("Propunere respinsă. Nimic nu s-a schimbat.");
        else if (execution?.ok) toast.success(execution.message);
        else if (execution) toast.error(execution.message);
        void queryClient.invalidateQueries({ queryKey: ["marketing", "drafts", propertyId] });
        void queryClient.invalidateQueries({ queryKey: ["property"] });
      } else {
        setError(result.message);
      }
    },
    onError: () => setError("Decizia nu a putut fi procesată. Nicio dată nu a fost modificată."),
  });

  const busy =
    generateMutation.isPending || proposeMutation.isPending || decideMutation.isPending;
  const proposal = run?.status === "suspended" ? run.proposal : null;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Text copiat.");
    } catch {
      toast.error("Textul nu a putut fi copiat.");
    }
  }

  function toggleProperty(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : prev.length >= 5 ? prev : [...prev, id],
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Marketing Agent</CardTitle>
          <p className="text-sm text-muted-foreground">
            Generează titluri, descrieri și postări pornind strict de la datele proprietății.
            Textul rămâne ciornă până când îl salvezi sau îl aplici tu.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {allowPropertyPicker ? (
            <div className="space-y-2">
              <Label>Proprietăți (maximum 5)</Label>
              <div className="flex flex-wrap gap-2">
                {(properties.data ?? []).slice(0, 60).map((option) => (
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
              {properties.isLoading ? (
                <p className="text-xs text-muted-foreground">Se încarcă proprietățile…</p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(value) => setChannel(value as MarketingChannel)}>
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
            <div className="space-y-1.5">
              <Label>Ton</Label>
              <Select value={tone} onValueChange={(value) => setTone(value as MarketingTone)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETING_TONES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {MARKETING_TONE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Lungime</Label>
              <Select value={length} onValueChange={(value) => setLength(value as MarketingLength)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETING_LENGTHS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {MARKETING_LENGTH_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="marketing-notes">Instrucțiuni suplimentare (opțional)</Label>
            <Textarea
              id="marketing-notes"
              rows={2}
              value={notes}
              placeholder="Ex.: accent pe apropierea de parc, doar dacă informația există în fișa proprietății."
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={busy || ids.length === 0}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending
                ? "Se generează…"
                : run
                  ? "Regenerează"
                  : "Generează conținut"}
            </Button>
            {ids.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Alege cel puțin o proprietate.
              </span>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {proposal ? (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Propunere</Badge>
              <Badge variant="outline">Așteaptă aprobarea ta</Badge>
            </div>
            <CardTitle className="text-base">{run?.proposalLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Proprietate: </span>
              {proposal.propertyLabel}
            </p>
            {proposal.changes.map((change) => (
              <p key={change.label}>
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
            {proposal.warnings.map((warning) => (
              <p key={warning} className="text-xs text-muted-foreground">
                {warning}
              </p>
            ))}
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => decideMutation.mutate(false)}
              >
                Respinge
              </Button>
              <Button size="sm" disabled={busy} onClick={() => decideMutation.mutate(true)}>
                {decideMutation.isPending ? "Se procesează…" : "Aprobă"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {(run?.failures ?? []).length > 0 ? (
        <Card>
          <CardContent className="space-y-1 py-4 text-sm">
            {run!.failures.map((failure) => (
              <p key={failure.propertyId} className="text-muted-foreground">
                {failure.message}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {(run?.results ?? []).map((result, index) => (
        <Card key={`${result.propertyId}-${index}`}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{result.propertyLabel}</Badge>
              <Badge variant="outline">{MARKETING_CHANNEL_SPECS[result.channel].label}</Badge>
              <Badge
                variant={
                  result.validationStatus === "invalid"
                    ? "destructive"
                    : result.validationStatus === "warning"
                      ? "secondary"
                      : "default"
                }
              >
                {VALIDATION_LABELS[result.validationStatus] ?? result.validationStatus}
              </Badge>
              {result.draftId ? <Badge variant="secondary">Ciornă salvată</Badge> : null}
            </div>
            {result.content.title ? (
              <CardTitle className="text-base">{result.content.title}</CardTitle>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap">{result.content.body}</p>

            {result.content.shortVariants.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs uppercase text-muted-foreground">Variante scurte</p>
                {result.content.shortVariants.map((variant) => (
                  <p key={variant} className="text-muted-foreground">
                    {variant}
                  </p>
                ))}
              </div>
            ) : null}

            {result.content.ideas.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs uppercase text-muted-foreground">Idei</p>
                {result.content.ideas.map((idea) => (
                  <p key={idea} className="text-muted-foreground">
                    {idea}
                  </p>
                ))}
              </div>
            ) : null}

            {result.content.cta ? (
              <p>
                <span className="text-muted-foreground">CTA: </span>
                {result.content.cta}
              </p>
            ) : null}

            {result.content.hashtags.length > 0 ? (
              <p className="text-muted-foreground">{result.content.hashtags.join(" ")}</p>
            ) : null}

            {result.issues.length > 0 ? (
              <div className="space-y-1 rounded-md border border-destructive/40 p-3">
                <p className="text-xs uppercase text-muted-foreground">Verificare factuală</p>
                {result.issues.map((issue, issueIndex) => (
                  <p key={`${issue.type}-${issueIndex}`} className="text-destructive">
                    {issue.message}
                  </p>
                ))}
              </div>
            ) : null}

            {result.missingData.length > 0 ? (
              <div className="space-y-1 rounded-md border p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Date lipsă care ar îmbunătăți anunțul
                </p>
                {result.missingData.map((item) => (
                  <p key={item.field} className="text-muted-foreground">
                    {item.question}
                  </p>
                ))}
              </div>
            ) : null}

            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void copy(
                    [result.content.title, result.content.body, result.content.cta]
                      .filter((part): part is string => typeof part === "string" && part !== "")
                      .join("\n\n"),
                  )
                }
              >
                Copiază
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || result.validationStatus === "invalid" || proposal !== null}
                onClick={() => proposeMutation.mutate({ resultIndex: index, mode: "save_draft" })}
              >
                Salvează ciornă
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  busy ||
                  result.validationStatus === "invalid" ||
                  proposal !== null ||
                  result.draftId === null
                }
                onClick={() =>
                  proposeMutation.mutate({ resultIndex: index, mode: "apply_to_property" })
                }
              >
                Aplică pe proprietate
              </Button>
            </div>
            {result.draftId === null ? (
              <p className="text-xs text-muted-foreground">
                Salvează mai întâi ciorna, apoi o poți aplica pe proprietate.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {propertyId && drafts.data && drafts.data.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Istoricul textelor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {drafts.data.map((draft) => (
              <div key={draft.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Versiunea {draft.version}</Badge>
                  <Badge variant={draft.source === "previous_property_text" ? "default" : "secondary"}>
                    {draft.source === "previous_property_text"
                      ? "Textul anterior al proprietății"
                      : "Generat de AI"}
                  </Badge>
                  {draft.appliedAt ? <Badge variant="secondary">Aplicat</Badge> : null}
                </div>
                {draft.title ? <p className="mt-2 font-medium">{draft.title}</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{draft.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

