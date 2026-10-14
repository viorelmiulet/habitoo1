import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, Film, Music, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  VIDEO_DEFAULT_PER_PHOTO, VIDEO_FORMATS, VIDEO_MAX_MUSIC_BYTES, VIDEO_MAX_PER_PHOTO, VIDEO_MAX_PHOTOS, VIDEO_MIN_PER_PHOTO,
  buildVideoOverlay, moveInList, planVideoTimeline, videoFileName, type VideoFormat, type VideoListing,
} from "@/lib/property-video";

type Photo = { id: string; url: string; alt: string | null };

export function PropertyVideoCard({ photos, listing }: { photos: Photo[]; listing: VideoListing }) {
  const [format, setFormat] = useState<VideoFormat>("vertical");
  const [order, setOrder] = useState<string[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [perPhoto, setPerPhoto] = useState(VIDEO_DEFAULT_PER_PHOTO);
  const [music, setMusic] = useState<File | null>(null);
  const [opts, setOpts] = useState({ showLogo: true, showPhone: true, showPrice: true });
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; webm: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const photoKey = photos.map((p) => p.id).join("|");
  useEffect(() => { setOrder(photos.slice(0, VIDEO_MAX_PHOTOS).map((p) => p.id)); }, [photoKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void import("@/lib/property-video-render").then((m) => setSupported(m.videoGenerationSupported())); }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const byId = new Map(photos.map((p) => [p.id, p]));
  const chosen = order.filter((id) => !off.has(id) && byId.has(id));
  const plan = planVideoTimeline(chosen.length, perPhoto);
  const hasLogo = Boolean(listing.logoUrl);
  const busy = progress !== null;

  const pickMusic = (file: File | undefined) => {
    setError(null);
    if (!file) return setMusic(null);
    if (file.size > VIDEO_MAX_MUSIC_BYTES) return setError("Fișierul de muzică depășește 10 MB.");
    if (!/mpeg|mp3/.test(file.type) && !/\.mp3$/i.test(file.name)) return setError("Alege un fișier MP3.");
    setMusic(file);
  };

  const generate = async () => {
    setError(null); setResult(null); setProgress(0);
    const ctrl = new AbortController(); abortRef.current = ctrl;
    try {
      const { renderPropertyVideo } = await import("@/lib/property-video-render");
      const r = await renderPropertyVideo({
        format, perPhoto: plan.perPhoto, music, signal: ctrl.signal, onProgress: setProgress,
        photoUrls: chosen.map((id) => byId.get(id)!.url),
        overlay: buildVideoOverlay({ ...listing, logoUrl: hasLogo ? listing.logoUrl : null }, { ...opts, showLogo: opts.showLogo && hasLogo }),
      });
      setResult({ url: URL.createObjectURL(r.blob), name: videoFileName(listing.reference, format, r.ext), webm: r.ext === "webm" });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message === "UNSUPPORTED"
          ? "Acest dispozitiv nu poate genera video. Încearcă de pe un calculator, în Chrome sau Edge."
          : "Video-ul nu a putut fi generat. Încearcă din nou sau folosește un calculator.");
      }
    } finally { setProgress(null); abortRef.current = null; }
  };

  return (
    <div className="panel space-y-5 p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-control bg-accent text-accent-foreground"><Film className="size-5" aria-hidden /></span>
        <div>
          <h3 className="font-medium">Video de prezentare</h3>
          <p className="text-sm text-muted-foreground">Generat în browser din pozele anunțului. Nu se salvează nimic pe server.</p>
        </div>
      </div>

      {!supported ? (
        <p role="alert" className="rounded-control border border-border bg-muted p-3 text-sm">Acest dispozitiv nu suportă generarea video. Te rugăm să folosești un calculator.</p>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">Format</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(VIDEO_FORMATS) as VideoFormat[]).map((f) => (
            <Button key={f} type="button" variant={format === f ? "default" : "outline"} className="h-auto flex-col items-start py-2" onClick={() => setFormat(f)} aria-pressed={format === f}>
              <span>{VIDEO_FORMATS[f].label}</span>
              <span className="text-xs font-normal opacity-80">{VIDEO_FORMATS[f].help}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Poze ({chosen.length}/{Math.min(VIDEO_MAX_PHOTOS, photos.length)})</p>
        {photos.length === 0 ? <p className="text-sm text-muted-foreground">Anunțul nu are fotografii publicabile.</p> : (
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {order.map((id, i) => {
              const p = byId.get(id); if (!p) return null;
              const on = !off.has(id);
              return (
                <li key={id} className={cn("flex items-center gap-2 rounded-control border border-border p-2", !on && "opacity-60")}>
                  <Checkbox checked={on} aria-label={`Include poza ${i + 1}`} onCheckedChange={(v) => setOff((s) => { const n = new Set(s); if (v === true) n.delete(id); else n.add(id); return n; })} />
                  <img src={p.url} alt={p.alt ?? ""} className="size-12 rounded-md object-cover" />
                  <span className="flex-1 text-xs">Poza {i + 1}</span>
                  <Button type="button" size="icon" variant="ghost" aria-label="Mută mai sus" disabled={i === 0} onClick={() => setOrder((o) => moveInList(o, i, -1))}><ArrowUp className="size-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Mută mai jos" disabled={i === order.length - 1} onClick={() => setOrder((o) => moveInList(o, i, 1))}><ArrowDown className="size-4" /></Button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Durată pe poză: {perPhoto} s</Label>
          <Slider min={VIDEO_MIN_PER_PHOTO} max={VIDEO_MAX_PER_PHOTO} step={0.5} value={[perPhoto]} onValueChange={([v]) => setPerPhoto(v ?? VIDEO_DEFAULT_PER_PHOTO)} aria-label="Durată pe poză" />
          <p className="text-xs text-muted-foreground">
            Durată totală: {plan.total} s{plan.reduced ? ` · ${plan.perPhoto} s pe poză, ca video-ul să nu depășească 60 s` : ""}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="video-music">Muzică (opțional, MP3, max. 10 MB)</Label>
          <div className="flex items-center gap-2">
            <input id="video-music" type="file" accept="audio/mpeg,.mp3" className="block w-full text-sm file:mr-3 file:rounded-control file:border file:border-border file:bg-muted file:px-3 file:py-1.5" onChange={(e) => pickMusic(e.target.files?.[0])} />
            {music ? <Button type="button" size="icon" variant="ghost" aria-label="Elimină muzica" onClick={() => setMusic(null)}><X className="size-4" /></Button> : null}
          </div>
          {music ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><Music className="size-3" />{music.name} · se taie la lungimea video-ului, cu fade-out de 2 s</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={opts.showLogo && hasLogo} disabled={!hasLogo} onCheckedChange={(v) => setOpts((o) => ({ ...o, showLogo: v === true }))} />Logo agenție{hasLogo ? "" : " (lipsă)"}</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={opts.showPhone} onCheckedChange={(v) => setOpts((o) => ({ ...o, showPhone: v === true }))} />Telefon agent</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={opts.showPrice} onCheckedChange={(v) => setOpts((o) => ({ ...o, showPrice: v === true }))} />Preț</label>
      </div>

      {busy ? (
        <div className="flex items-center gap-3" role="status">
          <Progress value={progress ?? 0} className="flex-1" />
          <span className="w-12 text-sm tabular-nums">{progress}%</span>
          <Button type="button" variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>Anulează</Button>
        </div>
      ) : (
        <Button type="button" onClick={generate} disabled={!supported || chosen.length === 0}><Film className="size-4" /> Generează video</Button>
      )}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {result ? (
        <div className="space-y-3">
          {result.webm ? <p role="alert" className="text-sm text-destructive">Browserul a generat WebM. Instagram nu acceptă WebM; pentru MP4 folosește Chrome sau Edge pe calculator.</p> : null}
          <video src={result.url} controls playsInline className="max-h-[480px] w-full rounded-xl bg-muted object-contain" />
          <Button asChild variant="outline"><a href={result.url} download={result.name}><Download className="size-4" /> Descarcă video</a></Button>
        </div>
      ) : null}
    </div>
  );
}
