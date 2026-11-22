/**
 * Cardul „Completează cu AI”: poze + text → propuneri în formular.
 * Nimic nu se salvează aici; agentul verifică și apasă „Salvează”.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { FormSection } from "@/components/app/FormSection";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET, compressImage, signedUrls } from "@/lib/storage";
import { reorderPropertyPhotos } from "@/lib/property-photo-upload";
import { manualCoverFor, orderedPhotos } from "@/lib/ai/listing-autofill/photo-order";
import { autofillListing } from "@/lib/ai/listing-autofill/autofill.functions";
import {
  AUTOFILL_IMAGE_MAX_EDGE,
  AUTOFILL_MAX_PHOTOS,
  type AutofillProposal,
} from "@/lib/ai/listing-autofill/schema";
import { autofillCountLabel, autofillSummaryRows } from "@/lib/ai/listing-autofill/summary";
import type { AutofillFormContext } from "@/lib/ai/listing-autofill/autofill.server";

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function prepareImage(file: File) {
  const { blob } = await compressImage(file, AUTOFILL_IMAGE_MAX_EDGE, 0.78);
  return { mimeType: "image/jpeg" as const, base64: await blobToBase64(blob) };
}

type Props = {
  mode: "new" | "edit";
  /** Modul „new”: pozele alese, încărcate în galerie la salvare. */
  photos?: File[];
  onPhotosChange?: (files: File[]) => void;
  /** Modul „edit”: galeria existentă a proprietății. */
  propertyId?: string;
  onProposal: (proposal: AutofillProposal) => AutofillProposal;
  /** Câmpurile marcate „AI” acum în formular. */
  marked: string[];
  onRemoveField: (key: string) => void;
  onAcceptAll: () => void;
  missing: string[];
  /** Titlul, descrierea și valorile deja completate în formular, trimise ca context. */
  formContext?: () => AutofillFormContext;
};

export function ListingAutofillCard({ mode, photos = [], onPhotosChange, propertyId, onProposal, marked, onRemoveField, onAcceptAll, missing, formContext }: Props) {
  const { isEnabled, isLoading } = useAiFeatures();
  const queryClient = useQueryClient();
  const run = useServerFn(autofillListing);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalPhotos, setOriginalPhotos] = useState<File[] | string[] | null>(null);
  const [coverPreserved, setCoverPreserved] = useState(false);
  const manualCover = useRef<File | undefined>(undefined);
  const currentPhotos = useRef(photos);
  currentPhotos.current = photos;
  const [applied, setApplied] = useState<AutofillProposal | null>(null);
  const [showAll, setShowAll] = useState(false);

  const existing = useQuery({
    queryKey: ["property-images", propertyId],
    enabled: mode === "edit" && Boolean(propertyId),
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error: e } = await supabase.from("property_images").select("id,storage_path,position").eq("property_id", propertyId).order("position", { ascending: true });
      if (e) throw e;
      return (data ?? []) as { id: string; storage_path: string | null; position: number }[];
    },
  });
  const existingImages = (existing.data ?? []).filter((i) => i.storage_path).slice(0, AUTOFILL_MAX_PHOTOS);

  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    if (mode !== "new") return;
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [mode, photos]);

  if (isLoading || !isEnabled("ai_listing_autofill")) return null;

  const photoCount = mode === "new" ? photos.length : existingImages.length;
  const ctxNow = formContext?.();
  const hasInput = photoCount > 0 || text.trim().length > 0 || Boolean(ctxNow?.description?.trim() || ctxNow?.title?.trim());

  const addPhotos = (list: FileList | null) => {
    if (!list || !onPhotosChange) return;
    const next = [...photos, ...Array.from(list).filter((f) => f.type.startsWith("image/"))];
    if (next.length > AUTOFILL_MAX_PHOTOS) toast.info(`Analizăm primele ${AUTOFILL_MAX_PHOTOS} poze.`);
    onPhotosChange(next);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    const photosAtRun = [...photos];
    const galleryAtRun = [...(existing.data ?? [])];
    try {
      let files: File[] = photos.slice(0, AUTOFILL_MAX_PHOTOS);
      if (mode === "edit") {
        const signed = await signedUrls(MEDIA_BUCKET, existingImages.flatMap((i) => i.storage_path ? [i.storage_path] : []));
        files = await Promise.all(existingImages.map(async (img, i) => {
          const url = img.storage_path ? signed[img.storage_path] : undefined;
          if (!url) throw new Error("Fotografie indisponibilă.");
          const blob = await (await fetch(url)).blob();
          return new File([blob], `foto-${i}.jpg`, { type: blob.type || "image/jpeg" });
        }));
      }
      const images = await Promise.all(files.map(prepareImage));
      const result = await run({ data: {
        images,
        text,
        context: formContext?.(),
      } });
      if (!result.ok) { setError(result.message); return; }
      const shown = onProposal(result.proposal);
      setApplied(shown);
      setShowAll(false);
      setOriginalPhotos(null);
      setCoverPreserved(false);
      try {
        if (mode === "new" && currentPhotos.current.length === photosAtRun.length && currentPhotos.current.every((p, i) => p === photosAtRun[i])) {
          const cover = manualCover.current;
          const next = orderedPhotos(photosAtRun, photosAtRun.slice(0, AUTOFILL_MAX_PHOTOS), result.proposal.photoOrder, cover);
          if (next && onPhotosChange) { onPhotosChange(next); setOriginalPhotos(photosAtRun); }
          if (cover && result.proposal.photoOrder) setCoverPreserved(true);
        } else if (mode === "edit" && propertyId) {
          const ids = galleryAtRun.map((img) => img.id);
          const latest = queryClient.getQueryData<typeof galleryAtRun>(["property-images", propertyId]);
          if (!latest || latest.length !== ids.length || latest.some((img, i) => img.id !== ids[i])) return;
          const cover = manualCoverFor(propertyId);
          const next = orderedPhotos(ids, existingImages.map((img) => img.id), result.proposal.photoOrder, cover);
          if (next) {
            await reorderPropertyPhotos(next);
            setOriginalPhotos(ids);
            await queryClient.invalidateQueries({ queryKey: ["property-images", propertyId] });
          }
          if (cover && result.proposal.photoOrder) setCoverPreserved(true);
        }
      } catch { toast.error("Ordinea nu a putut fi aplicată. Încearcă din nou."); }
      const count = Object.keys(shown.values).length + (shown.title ? 1 : 0) + (shown.description ? 1 : 0);
      toast.success(count ? `AI-ul a propus ${count} câmpuri. Verifică-le înainte de salvare.` : "AI-ul nu a găsit câmpuri noi de completat.");
    } catch {
      setError("Nu am putut completa automat. Încearcă din nou sau completează manual.");
    } finally {
      setBusy(false);
    }
  };

  const undoOrder = async () => {
    if (!originalPhotos || busy) return;
    if (mode === "new") {
      const before = originalPhotos.filter((p): p is File => typeof p !== "string");
      const now = currentPhotos.current;
      onPhotosChange?.([...before.filter((p) => now.includes(p)), ...now.filter((p) => !before.includes(p))]);
      setOriginalPhotos(null);
      return;
    }
    setBusy(true);
    try {
      const before = originalPhotos.filter((p): p is string => typeof p === "string");
      const now = (existing.data ?? []).map((p) => p.id);
      await reorderPropertyPhotos([...before.filter((id) => now.includes(id)), ...now.filter((id) => !before.includes(id))]);
      await queryClient.invalidateQueries({ queryKey: ["property-images", propertyId] });
      setOriginalPhotos(null);
    } catch {
      toast.error("Ordinea inițială nu a putut fi restaurată. Încearcă din nou.");
    } finally { setBusy(false); }
  };

  const summaryRows = applied ? autofillSummaryRows(applied, marked) : [];
  const visibleRows = showAll ? summaryRows : summaryRows.slice(0, 8);

  return (
    <div data-testid="listing-autofill-card">
    <FormSection title="Completează cu AI" description="Încarcă pozele și scrie câteva fraze. AI-ul propune valori; tu le verifici înainte de salvare.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Poze {photoCount ? `(${Math.min(photoCount, AUTOFILL_MAX_PHOTOS)})` : ""}</Label>
          {mode === "new" ? <>
            <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" aria-label="Alege pozele" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            <div className="flex flex-wrap gap-2">
              {previews.map((url, i) => <div key={url} className="relative size-16 overflow-hidden rounded-control border border-border">
                <img src={url} alt={`Poza ${i + 1}`} className="size-full object-cover" />
                {i === 0 ? <span className="absolute bottom-0 left-0 right-0 bg-primary/85 text-center text-[10px] text-primary-foreground">Copertă</span> : null}
                {i > 0 ? <Button type="button" size="icon" variant="secondary" disabled={busy} title="Alege coperta" aria-label={`Alege poza ${i + 1} drept copertă`} className="absolute bottom-0 left-0 size-5" onClick={() => { const chosen = photos[i]; if (!chosen) return; manualCover.current = chosen; onPhotosChange?.([chosen, ...photos.filter((p) => p !== chosen)]); }}><ImagePlus className="size-3" /></Button> : null}
                <Button type="button" size="icon" variant="secondary" disabled={busy} aria-label={`Elimină poza ${i + 1}`} className="absolute right-0.5 top-0.5 size-5 rounded-full" onClick={() => onPhotosChange?.(photos.filter((_, j) => j !== i))}><X className="size-3" /></Button>
              </div>)}
              <Button type="button" variant="outline" className="size-16 flex-col gap-0.5 p-0 text-[11px]" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" />Adaugă</Button>
            </div>
            <p className="text-xs text-muted-foreground">Pozele se adaugă în galeria proprietății la salvare.</p>
          </> : <p className="text-sm text-muted-foreground">{existingImages.length ? `Se analizează ${existingImages.length} fotografii din galeria proprietății.` : "Proprietatea nu are încă fotografii. Încarcă-le din fila Media."}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${mode}-autofill-text`}>Descrie proprietatea în câteva cuvinte</Label>
          <Textarea id={`${mode}-autofill-text`} rows={5} className="min-h-28 flex-1" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="Ex.: 2 camere, 75.000 euro, etaj 3, renovat recent" />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!hasInput || busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {mode === "new" ? "Completează cu AI" : "Corectează cu AI"}
          </Button>
        </div>
        {applied ? <div className="flex-1 space-y-2 rounded-card border border-border bg-muted/40 p-3 text-sm" data-testid="autofill-summary">
          <p className="font-medium">Completat de AI: {autofillCountLabel(summaryRows.length)}</p>
          {coverPreserved ? <p className="text-xs text-muted-foreground">Coperta aleasă de tine a rămas neschimbată.</p> : null}
          {summaryRows.length || originalPhotos ? <>
            <ul className="space-y-1">
              {visibleRows.map((row) => <li key={row.key} className="flex items-center gap-1.5 rounded-control bg-background px-2 py-1">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{row.label}:</span> {row.value}
                  {row.source ? <span className="text-muted-foreground"> · {row.source}</span> : null}
                  {row.check ? <span className="text-muted-foreground"> · de verificat</span> : null}
                </span>
                <button type="button" aria-label={`Anulează ${row.label}`} className="shrink-0 rounded-full p-0.5 hover:bg-muted" onClick={() => onRemoveField(row.key)}><X className="size-3" /></button>
              </li>)}
              {originalPhotos ? <li className="flex items-center gap-1.5 rounded-control bg-background px-2 py-1">
                <span className="min-w-0 flex-1"><span className="font-medium">Ordinea pozelor:</span> schimbată{coverPreserved ? " (coperta păstrată)" : " (coperta nouă)"}</span>
                <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label="Anulează ordinea propusă a pozelor" className="size-6 shrink-0 rounded-full" onClick={() => void undoOrder()}><X className="size-3" /></Button>
              </li> : null}
            </ul>
            {summaryRows.length > 8 ? <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setShowAll((v) => !v)}>{showAll ? "Arată mai puțin" : `Arată tot (${summaryRows.length})`}</button> : null}
          </> : <p className="text-muted-foreground">Nu am găsit câmpuri noi de completat.</p>}
          {missing.length ? <p><span className="font-medium">Lipsește încă:</span> {missing.join(", ")}</p> : null}
          {summaryRows.length ? <Button type="button" size="sm" variant="outline" onClick={onAcceptAll}>Acceptă tot</Button> : null}
        </div> : null}
      </div>
    </FormSection>
    </div>
  );
}
