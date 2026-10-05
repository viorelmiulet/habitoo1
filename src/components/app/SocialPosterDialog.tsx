import { useEffect, useRef, useState } from "react";
import { Download, Image as ImageIcon, Loader2, MapPin } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET, signedUrls } from "@/lib/storage";
import {
  downloadPoster,
  posterFileName,
  renderSocialPoster,
  type SocialPosterFormat,
  type SocialPosterTransaction,
} from "@/lib/social-poster";
import { cn } from "@/lib/utils";

type PosterPreferences = { format: SocialPosterFormat; showLogo: boolean; showPhone: boolean; showPrice: boolean };

type SocialPosterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  userId: string;
  title: string;
  location: string;
  rooms: number | null;
  surface: number | null;
  floor: string | null;
  forSale: boolean;
  forRent: boolean;
  salePrice: number | null;
  rentPrice: number | null;
  saleCurrency: string;
  rentCurrency: string;
  logoUrl: string | null;
  phone: string | null;
};

const DEFAULT_PREFERENCES: PosterPreferences = { format: "story", showLogo: true, showPhone: false, showPrice: true };

export function SocialPosterDialog(props: SocialPosterDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<SocialPosterTransaction>(props.forRent && !props.forSale ? "rent" : "sale");
  const [preferences, setPreferences] = useState<PosterPreferences>(DEFAULT_PREFERENCES);
  const storageKey = `habitoo:social-poster:${props.userId}`;

  useEffect(() => {
    if (!props.open) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(saved) as Partial<PosterPreferences> });
    } catch {
      setPreferences(DEFAULT_PREFERENCES);
    }
  }, [props.open, storageKey]);

  useEffect(() => {
    if (!props.open) return;
    let active = true;
    setLoadingPhotos(true);
    setError(null);
    void (async () => {
      const { data, error: queryError } = await supabase
        .from("property_images")
        .select("url,storage_path,position,is_primary,is_confidential")
        .eq("property_id", props.propertyId)
        .eq("is_confidential", false)
        .order("position");
      if (queryError) throw queryError;
      const sorted = [...(data ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position);
      const paths = sorted.map((row) => row.storage_path).filter((path): path is string => Boolean(path));
      const signed = await signedUrls(MEDIA_BUCKET, paths);
      const urls = sorted
        .map((row) => (row.storage_path ? signed[row.storage_path] : null) ?? row.url ?? null)
        .filter((url): url is string => Boolean(url));
      if (!active) return;
      setPhotos(urls);
      setPhotoIndex(0);
      if (!urls.length) setError("Adaugă cel puțin o fotografie pentru a crea imaginea.");
    })().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Fotografiile nu au putut fi încărcate.");
    }).finally(() => {
      if (active) setLoadingPhotos(false);
    });
    return () => { active = false; };
  }, [props.open, props.propertyId]);

  useEffect(() => {
    if (!props.open || !photos[photoIndex] || !canvasRef.current) return;
    let active = true;
    setRendering(true);
    setError(null);
    void renderSocialPoster(canvasRef.current, {
      format: preferences.format,
      transaction,
      photoUrl: photos[photoIndex],
      logoUrl: props.logoUrl,
      showLogo: preferences.showLogo && Boolean(props.logoUrl),
      showPhone: preferences.showPhone && Boolean(props.phone),
      showPrice: preferences.showPrice,
      title: props.title,
      location: props.location,
      rooms: props.rooms,
      surface: props.surface,
      floor: props.floor,
      phone: props.phone,
      price: transaction === "sale" ? props.salePrice : props.rentPrice,
      currency: transaction === "sale" ? props.saleCurrency : props.rentCurrency,
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Previzualizarea nu a putut fi creată.");
    }).finally(() => {
      if (active) setRendering(false);
    });
    return () => { active = false; };
  }, [
    photoIndex,
    photos,
    preferences,
    props.floor,
    props.location,
    props.logoUrl,
    props.phone,
    props.rentCurrency,
    props.rentPrice,
    props.rooms,
    props.saleCurrency,
    props.salePrice,
    props.surface,
    props.title,
    props.open,
    transaction,
  ]);

  const updatePreferences = (patch: Partial<PosterPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* preferințele rămân valabile în fereastra curentă */ }
  };

  const download = () => {
    if (!canvasRef.current || rendering || error) return;
    downloadPoster(canvasRef.current, posterFileName(preferences.format, props.title));
    toast.success("Imaginea PNG a fost descărcată.");
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Imagine pentru story / postare</DialogTitle>
          <DialogDescription>Pregătește imaginea și descarc-o. Habitoo nu publică pe rețele sociale.</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
          <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg bg-muted p-3">
            {loadingPhotos ? <Loader2 className="size-7 animate-spin text-muted-foreground" aria-label="Se încarcă fotografiile" /> : null}
            {!loadingPhotos && photos.length ? (
              <div className={cn("relative max-h-[68vh] overflow-hidden rounded-lg shadow-lg", preferences.format === "story" ? "aspect-[9/16]" : "aspect-[4/5]") }>
                <canvas ref={canvasRef} className="block h-full w-full object-contain" aria-label="Previzualizare imagine social media" />
                {rendering ? <div className="absolute inset-0 grid place-items-center bg-background/50"><Loader2 className="size-7 animate-spin" /></div> : null}
              </div>
            ) : null}
            {!loadingPhotos && !photos.length ? <div className="max-w-xs text-center text-sm text-muted-foreground"><ImageIcon className="mx-auto mb-3 size-8" />Adaugă cel puțin o fotografie pentru a crea imaginea.</div> : null}
          </div>

          <div className="min-w-0 space-y-5">
            <div className="space-y-2">
              <Label>Format</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={preferences.format === "story" ? "default" : "outline"} onClick={() => updatePreferences({ format: "story" })}>Story 1080×1920</Button>
                <Button type="button" variant={preferences.format === "post" ? "default" : "outline"} onClick={() => updatePreferences({ format: "post" })}>Postare 1080×1350</Button>
              </div>
            </div>

            {props.forSale && props.forRent ? (
              <div className="space-y-2">
                <Label htmlFor="poster-transaction">Tranzacție</Label>
                <Select value={transaction} onValueChange={(value) => setTransaction(value as SocialPosterTransaction)}>
                  <SelectTrigger id="poster-transaction"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="sale">De vânzare</SelectItem><SelectItem value="rent">De închiriat</SelectItem></SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Fotografie</Label>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {photos.map((photo, index) => (
                  <Button key={photo} type="button" variant="ghost" className={cn("h-auto aspect-square overflow-hidden border p-0", photoIndex === index ? "ring-2 ring-ring" : "")} onClick={() => setPhotoIndex(index)} aria-label={`Alege fotografia ${index + 1}`}>
                    <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </Button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-border rounded-lg border border-border">
              <OptionRow label="Logo" help={props.logoUrl ? "Sigla agenției, sus-stânga." : "Adaugă un logo în Setări → Branding"} checked={preferences.showLogo && Boolean(props.logoUrl)} disabled={!props.logoUrl} onCheckedChange={(checked) => updatePreferences({ showLogo: checked })} />
              <OptionRow label="Telefon" help={props.phone ? "Numărul agentului responsabil." : "Agentul responsabil nu are telefon."} checked={preferences.showPhone && Boolean(props.phone)} disabled={!props.phone} onCheckedChange={(checked) => updatePreferences({ showPhone: checked })} />
              <OptionRow label="Preț" help="Ascunde blocul de preț pentru ofertele la cerere." checked={preferences.showPrice} onCheckedChange={(checked) => updatePreferences({ showPrice: checked })} />
            </div>

            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <p className="flex items-start gap-2 text-xs text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" />Imaginea folosește numai datele vizibile ale proprietății.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>Închide</Button>
          <Button onClick={download} disabled={!photos.length || rendering || Boolean(error)}><Download className="size-4" />Descarcă PNG</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionRow({ label, help, checked, disabled, onCheckedChange }: { label: string; help: string; checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{help}</p></div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}