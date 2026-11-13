/**
 * Cardul „Completează cu AI”: poze + voce/text → propuneri în formular.
 * Nimic nu se salvează aici; agentul verifică și apasă „Salvează”.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Mic, Sparkles, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { FormSection } from "@/components/app/FormSection";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET, compressImage, signedUrls } from "@/lib/storage";
import { reorderPropertyPhotos } from "@/lib/property-photo-upload";
import { autofillListing } from "@/lib/ai/listing-autofill/autofill.functions";
import {
  AUTOFILL_AUDIO_TOO_LONG_MESSAGE,
  AUTOFILL_IMAGE_MAX_EDGE,
  AUTOFILL_MAX_AUDIO_SECONDS,
  AUTOFILL_MAX_PHOTOS,
  autofillFieldLabel,
  type AutofillProposal,
} from "@/lib/ai/listing-autofill/schema";

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

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
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
};

export function ListingAutofillCard({ mode, photos = [], onPhotosChange, propertyId, onProposal, marked, onRemoveField, onAcceptAll, missing }: Props) {
  const { isEnabled, isLoading } = useAiFeatures();
  const queryClient = useQueryClient();
  const run = useServerFn(autofillListing);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<{ blob: Blob; url: string; duration: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoOrder, setPhotoOrder] = useState<number[] | null>(null);
  const [applied, setApplied] = useState<AutofillProposal | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const existing = useQuery({
    queryKey: ["property-images", propertyId],
    enabled: mode === "edit" && Boolean(propertyId),
    queryFn: async () => {
      const { data, error: e } = await supabase.from("property_images").select("id,storage_path,position").eq("property_id", propertyId!).order("position", { ascending: true });
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
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio.url); }, [audio]);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); recorderRef.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  if (isLoading || !isEnabled("ai_listing_autofill")) return null;

  const photoCount = mode === "new" ? photos.length : existingImages.length;
  const hasInput = photoCount > 0 || Boolean(audio) || text.trim().length > 0;

  const stop = () => {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };

  const start = async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Browserul nu permite înregistrarea vocală. Scrie descrierea în câmpul de text.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = (Date.now() - startedRef.current) / 1000;
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" });
        setAudio((old) => { if (old) URL.revokeObjectURL(old.url); return { blob, url: URL.createObjectURL(blob), duration }; });
      };
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setSeconds(0);
      recorder.start();
      setRecording(true);
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedRef.current) / 1000);
        setSeconds(s);
        if (s >= AUTOFILL_MAX_AUDIO_SECONDS) stop();
      }, 250);
    } catch {
      setError("Nu am primit acces la microfon. Poți scrie descrierea în câmpul de text.");
    }
  };

  const addPhotos = (list: FileList | null) => {
    if (!list || !onPhotosChange) return;
    const next = [...photos, ...Array.from(list).filter((f) => f.type.startsWith("image/"))];
    if (next.length > AUTOFILL_MAX_PHOTOS) toast.info(`Analizăm primele ${AUTOFILL_MAX_PHOTOS} poze.`);
    onPhotosChange(next);
    setPhotoOrder(null);
  };

  const submit = async () => {
    setError(null);
    if (audio && audio.duration > AUTOFILL_MAX_AUDIO_SECONDS + 1) { setError(AUTOFILL_AUDIO_TOO_LONG_MESSAGE); return; }
    setBusy(true);
    try {
      let files: File[] = photos.slice(0, AUTOFILL_MAX_PHOTOS);
      if (mode === "edit") {
        const signed = await signedUrls(MEDIA_BUCKET, existingImages.map((i) => i.storage_path!));
        files = await Promise.all(existingImages.map(async (img, i) => {
          const blob = await (await fetch(signed[img.storage_path!]!)).blob();
          return new File([blob], `foto-${i}.jpg`, { type: blob.type || "image/jpeg" });
        }));
      }
      const images = await Promise.all(files.map(prepareImage));
      const result = await run({ data: {
        images,
        audio: audio ? { mimeType: audio.blob.type || "audio/webm", base64: await blobToBase64(audio.blob), durationSec: audio.duration } : null,
        text,
      } });
      if (!result.ok) { setError(result.message); return; }
      const shown = onProposal(result.proposal);
      setApplied(shown);
      setPhotoOrder(result.proposal.photoOrder);
      // Audio-ul nu se păstrează după procesare.
      setAudio((old) => { if (old) URL.revokeObjectURL(old.url); return null; });
      const count = Object.keys(shown.values).length + (shown.title ? 1 : 0) + (shown.description ? 1 : 0);
      toast.success(count ? `AI-ul a propus ${count} câmpuri. Verifică-le înainte de salvare.` : "AI-ul nu a găsit câmpuri noi de completat.");
    } catch {
      setError("Nu am putut completa automat. Încearcă din nou sau completează manual.");
    } finally {
      setBusy(false);
    }
  };

  const applyOrder = async () => {
    if (!photoOrder) return;
    if (mode === "new") {
      onPhotosChange?.(photoOrder.map((i) => photos[i]!).concat(photos.slice(photoOrder.length)));
      setPhotoOrder(null);
      toast.success("Ordinea propusă a fost aplicată. Prima poză va fi coperta.");
      return;
    }
    try {
      const ids = photoOrder.map((i) => existingImages[i]!.id);
      const rest = (existing.data ?? []).map((i) => i.id).filter((id) => !ids.includes(id));
      await reorderPropertyPhotos([...ids, ...rest]);
      await queryClient.invalidateQueries({ queryKey: ["property-images", propertyId] });
      setPhotoOrder(null);
      toast.success("Ordinea fotografiilor a fost aplicată.");
    } catch {
      toast.error("Ordinea nu a putut fi aplicată. Încearcă din nou.");
    }
  };

  const markedNow = marked.filter((k) => applied && (k in applied.values || k === "title" || k === "description"));

  return (
    <div data-testid="listing-autofill-card">
    <FormSection title="Completează cu AI" description="Încarcă pozele și dictează sau scrie câteva fraze. AI-ul propune valori; tu le verifici înainte de salvare.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Poze {photoCount ? `(${Math.min(photoCount, AUTOFILL_MAX_PHOTOS)})` : ""}</Label>
          {mode === "new" ? <>
            <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" aria-label="Alege pozele" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            <div className="flex flex-wrap gap-2">
              {previews.map((url, i) => <div key={url} className="relative size-16 overflow-hidden rounded-control border border-border">
                <img src={url} alt={`Poza ${i + 1}`} className="size-full object-cover" />
                {i === 0 ? <span className="absolute bottom-0 left-0 right-0 bg-primary/85 text-center text-[10px] text-primary-foreground">Copertă</span> : null}
                <button type="button" aria-label={`Elimină poza ${i + 1}`} className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5" onClick={() => onPhotosChange?.(photos.filter((_, j) => j !== i))}><X className="size-3" /></button>
              </div>)}
              <Button type="button" variant="outline" className="size-16 flex-col gap-0.5 p-0 text-[11px]" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" />Adaugă</Button>
            </div>
            <p className="text-xs text-muted-foreground">Pozele se adaugă în galeria proprietății la salvare.</p>
          </> : <p className="text-sm text-muted-foreground">{existingImages.length ? `Se analizează ${existingImages.length} fotografii din galeria proprietății.` : "Proprietatea nu are încă fotografii. Încarcă-le din fila Media."}</p>}
        </div>
        <div className="space-y-2">
          <Label>Voce (max. 2 minute)</Label>
          <div className="flex flex-wrap items-center gap-2">
            {recording ? <Button type="button" variant="destructive" size="sm" onClick={stop}><Square /> Oprește ({seconds}s)</Button>
              : <Button type="button" variant="outline" size="sm" onClick={() => void start()}><Mic /> {audio ? "Înregistrează din nou" : "Începe înregistrarea"}</Button>}
            {audio && !recording ? <>
              <audio controls src={audio.url} className="h-9 max-w-full" />
              <Button type="button" variant="ghost" size="icon" aria-label="Șterge înregistrarea" onClick={() => setAudio(null)}><Trash2 /></Button>
            </> : null}
          </div>
          <Label htmlFor={`${mode}-autofill-text`}>Descrie proprietatea în câteva cuvinte</Label>
          <Textarea id={`${mode}-autofill-text`} rows={3} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="Ex.: 2 camere, 75.000 euro, etaj 3, renovat recent" />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!hasInput || busy || recording} onClick={() => void submit()}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {mode === "new" ? "Completează cu AI" : "Completează câmpurile goale cu AI"}
        </Button>
        {photoOrder ? <Button type="button" variant="outline" onClick={() => void applyOrder()}>Aplică ordinea propusă a pozelor</Button> : null}
      </div>
      {applied ? <div className="space-y-2 rounded-card border border-border bg-muted/40 p-3 text-sm" data-testid="autofill-summary">
        <p className="font-medium">Completat de AI ({markedNow.length})</p>
        {markedNow.length ? <ul className="flex flex-wrap gap-1.5">{markedNow.map((key) => <li key={key} className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-1">
          {autofillFieldLabel(key)}{applied.confidence[key] === "medium" ? <span className="text-muted-foreground"> · de verificat</span> : null}
          <button type="button" aria-label={`Șterge ${autofillFieldLabel(key)}`} onClick={() => onRemoveField(key)}><X className="size-3" /></button>
        </li>)}</ul> : <p className="text-muted-foreground">Nicio propunere rămasă.</p>}
        {missing.length ? <p><span className="font-medium">Lipsește încă:</span> {missing.join(", ")}</p> : null}
        {markedNow.length ? <Button type="button" size="sm" variant="outline" onClick={onAcceptAll}>Acceptă tot</Button> : null}
      </div> : null}
    </FormSection>
    </div>
  );
}
