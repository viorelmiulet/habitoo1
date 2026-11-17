import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { diffWordsWithSpace } from "diff";
import { Loader2, SpellCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { correctListingText } from "@/lib/ai/text-correction/correction.functions";

export function TextCorrectionControl({ field, value, onApply }: { field: "title" | "description"; value: string; onApply: (text: string) => void }) {
  const { isLoading, isEnabled } = useAiFeatures();
  const run = useServerFn(correctListingText);
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const latest = useRef(value);
  latest.current = value;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ original: string; corrected: string; message?: string } | null>(null);
  // Toate hook-urile înainte de orice return (altfel React #310 la primul caracter tastat).
  const [corrected, setCorrected] = useState(false);
  if (isLoading || !isEnabled("ai_marketing") || !value.trim()) return null;
  const active = preview?.original === value ? preview : null;
  const correct = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null); setPreview(null);
    const original = value;
    try {
      const result = await run({ data: { text: original, field } });
      if (latest.current !== original) return;
      if (result.ok) setPreview({ original, corrected: result.text, message: result.message });
      else setError(result.message);
    } catch {
      setError("Nu am putut corecta textul. Încearcă din nou.");
    } finally {
      inFlight.current = false; setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ["ai-credits"] });
    }
  };
  const changes = active ? diffWordsWithSpace(active.original, active.corrected) : [];
  return <div className="min-w-0 space-y-2">
    <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={busy} onClick={correct}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <SpellCheck className="size-3.5" />} Corectează textul
    </Button>
    {corrected ? <span data-testid="text-corrected" className="ml-1 font-mono text-[11px] text-ai">✦ corectat</span> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {active ? <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3 text-sm" aria-label={`Corectare ${field === "title" ? "titlu" : "descriere"}`}>
      {active.message ? <p role="status" className="text-muted-foreground">{active.message}</p> : null}
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <div className="min-w-0"><p className="mb-1 font-medium">Original</p><p className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{changes.filter((part) => !part.added).map((part, index) => <span key={index} className={part.removed ? "bg-destructive/10 text-destructive line-through" : undefined}>{part.value}</span>)}</p></div>
        <div className="min-w-0"><p className="mb-1 font-medium">Corectat</p><p className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{changes.filter((part) => !part.removed).map((part, index) => <span key={index} className={part.added ? "bg-primary/15 text-primary underline" : undefined}>{part.value}</span>)}</p></div>
      </div>
      <div className="flex gap-2"><Button type="button" size="sm" onClick={() => { if (latest.current === active.original) { onApply(active.corrected); setCorrected(true); } setPreview(null); }}>Aplică</Button><Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)}>Renunță</Button></div>
    </div> : null}
  </div>;
}