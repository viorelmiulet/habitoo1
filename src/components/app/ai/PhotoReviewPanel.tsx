import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { toast } from "@/components/ui/sonner";
import { reviewListingPhotos } from "@/lib/ai/listing-autofill/photo-review.functions";
import { confirmedPhotoOrder, PHOTO_CATEGORIES, PHOTO_CATEGORY_LABELS, type PhotoReview } from "@/lib/ai/listing-autofill/photo-review";

export function PhotoReviewPanel({ propertyId, photos, onOrder, onExclude }: { propertyId: string; photos: { id: string; url: string | null }[]; onOrder: (ids: string[]) => Promise<void>; onExclude: (id: string) => Promise<void> }) {
  const { isEnabled } = useAiFeatures();
  const run = useServerFn(reviewListingPhotos);
  const [review, setReview] = useState<PhotoReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const inFlight = useRef(false);
  if (!isEnabled("ai_listing_autofill")) return null;
  const analyze = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null); setProgress(0);
    try {
      const found: PhotoReview["photos"] = [];
      for (let offset = 0; offset < photos.length; offset += 20) {
        const result = await run({ data: { propertyId, imageIds: photos.slice(offset, offset + 20).map((p) => p.id) } });
        if (!result.ok) throw new Error(result.message);
        found.push(...result.review.photos); setProgress(found.length);
      }
      setReview({ photos: found, order: [...found].sort((a, b) => PHOTO_CATEGORIES.indexOf(a.category) - PHOTO_CATEGORIES.indexOf(b.category)).map((p) => p.id) });
    } catch (e) { setError(e instanceof Error ? e.message : "Analiza nu este disponibilă acum."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const apply = async (excludeId?: string) => {
    if (inFlight.current || !review) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      if (excludeId) { await onExclude(excludeId); setExcluded((s) => [...s, excludeId]); }
      else { await onOrder(confirmedPhotoOrder(photos.map((p) => p.id), review.order, true)); toast.success("Ordinea propusă a fost aplicată."); }
    } catch { setError("Modificarea nu a putut fi aplicată. Reîncarcă galeria și încearcă din nou."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <section className="space-y-3 border-b border-border pb-4">
    <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto font-semibold">Verifică pozele cu AI</h3><Button type="button" variant="outline" disabled={busy || !photos.length} onClick={() => void analyze()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Analizează pozele</Button></div>
    {busy && progress > 0 ? <p className="text-sm text-muted-foreground">{progress}/{photos.length} fotografii analizate</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {review ? <><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void apply()}>Aplică ordinea propusă</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setReview(null)}>Ignoră</Button></div><ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{review.order.map((id) => {
      const p = review.photos.find((row) => row.id === id); const photo = photos.find((row) => row.id === id);
      if (!p || !photo) return null;
      return <li key={id} className="flex min-w-0 items-start gap-3 border border-border p-3 rounded-control">
        {photo.url ? <img className="size-16 shrink-0 rounded-control object-cover" src={photo.url} alt={PHOTO_CATEGORY_LABELS[p.category]} /> : null}
        <div className="min-w-0 space-y-1 text-sm"><p className="font-medium">Poza {photos.findIndex((row) => row.id === id) + 1} · {PHOTO_CATEGORY_LABELS[p.category]}</p>{p.reasons.map((reason) => <p key={reason} className="text-warning-foreground break-words">{reason}</p>)}
        {p.reasons.length ? <Button type="button" size="sm" variant="outline" disabled={busy || excluded.includes(id)} onClick={() => void apply(id)}>{excluded.includes(id) ? "Exclusă din publicare" : "Exclude din publicare"}</Button> : null}</div>
      </li>;
    })}</ol></> : null}
  </section>;
}