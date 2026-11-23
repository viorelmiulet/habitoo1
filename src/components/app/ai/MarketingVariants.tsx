import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { toast } from "@/components/ui/sonner";
import { generateMarketing, proposeMarketingAction, decideMarketingAction } from "@/lib/ai/agents/marketing/marketing.functions";
import { applyPortalDescription } from "@/lib/ai/agents/marketing/portal-description.functions";
import type { MarketingResult } from "@/lib/ai/agents/marketing/workflow";
import type { DescriptionPortal } from "@/lib/ai/agents/marketing/portal-description";

const VARIANTS = [
  { id: "short", label: "Scurtă · OLX", channel: "olx", length: "short", portal: "olx_direct" },
  { id: "detailed", label: "Detaliată · Storia / site", channel: "storia", length: "long", portal: "storia" },
  { id: "english", label: "Engleză · Properstar / European.realestate", channel: "properstar", length: "long", portal: "properstar" },
  { id: "facebook", label: "Facebook", channel: "facebook", length: "short", portal: null },
  { id: "instagram", label: "Instagram", channel: "instagram", length: "short", portal: null },
] as const;

export function MarketingVariants({ propertyId, onDescription, onSocial }: { propertyId: string; onDescription?: (value: string) => void; onSocial: (network: "facebook" | "instagram", text: string) => void }) {
  const { isEnabled } = useAiFeatures();
  const generate = useServerFn(generateMarketing); const propose = useServerFn(proposeMarketingAction); const decide = useServerFn(decideMarketingAction); const apply = useServerFn(applyPortalDescription);
  const [variantId, setVariantId] = useState<string>("short");
  const [result, setResult] = useState<{ runId: string; value: MarketingResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const variant = VARIANTS.find((v) => v.id === variantId) ?? VARIANTS[0];
  const run = useMutation({ mutationFn: async () => {
    setError(null); setResult(null); setSaved(false);
    const response = await generate({ data: { propertyIds: [propertyId], channel: variant.channel, contentType: variant.portal ? "listing" : "social_post", tone: "professional", length: variant.length } });
    const value = response.run?.results[0];
    if (response.status !== "ok" || !value || value.validationStatus === "invalid") throw new Error(response.message ?? "Textul nu a trecut verificarea faptelor. Încearcă din nou.");
    return { runId: response.run?.id ?? "", value };
  }, onSuccess: setResult, onError: (e) => setError(e.message) });
  const save = useMutation({ mutationFn: async (portal: DescriptionPortal) => {
    if (!result) return;
    const proposal = await propose({ data: { runId: result.runId, resultIndex: 0, mode: "save_draft" } });
    if (!proposal.ok) throw new Error(proposal.message ?? "Ciorna nu a putut fi pregătită.");
    const confirmed = await decide({ data: { runId: result.runId, approved: true } });
    if (!confirmed.ok) throw new Error(confirmed.message);
    const draftId = confirmed.run.results[0]?.draftId;
    if (!draftId) throw new Error("Ciorna nu a putut fi salvată.");
    const applied = await apply({ data: { propertyId, draftId, portal } });
    if (!applied.ok) throw new Error(applied.message);
    setSaved(true); toast.success(applied.message);
  }, onError: (e) => setError(e.message) });
  if (!isEnabled("ai_marketing")) return null;
  const body = result ? [result.value.content.body, ...(result.value.content.hashtags.length ? [result.value.content.hashtags.join(" ")] : [])].join("\n\n") : "";
  return <section className="space-y-3 border-t border-border pt-5">
    <h3 className="font-semibold">Variante de descriere cu AI</h3>
    <div className="flex flex-wrap gap-2">{VARIANTS.map((v) => <Button type="button" key={v.id} variant={variantId === v.id ? "default" : "outline"} disabled={run.isPending || save.isPending} aria-pressed={variantId === v.id} onClick={() => { setVariantId(v.id); setResult(null); setError(null); setSaved(false); }}>{v.label}</Button>)}</div>
    <Button type="button" variant="outline" disabled={run.isPending || save.isPending} onClick={() => run.mutate()}><Sparkles className="size-4" />{run.isPending ? "Se generează…" : "Generează varianta"}</Button>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {result ? <div className="space-y-3"><Textarea aria-label="Varianta propusă" readOnly value={body} rows={8} /><div className="flex flex-wrap gap-2">
      {variant.portal ? <><Button type="button" variant="outline" disabled={save.isPending || saved} onClick={() => save.mutate(variant.portal)}> {saved ? "Selectată pentru portal" : save.isPending ? "Se salvează…" : "Salvează descrierea pentru portal"}</Button>{onDescription ? <Button type="button" onClick={() => onDescription(result.value.content.body)}>Aplică în formular</Button> : null}</> : <Button type="button" onClick={() => onSocial(variant.channel === "instagram" ? "instagram" : "facebook", body)}>Aplică în postare</Button>}
      <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setResult(null)}>Ignoră</Button>
    </div></div> : null}
  </section>;
}