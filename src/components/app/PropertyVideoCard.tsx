import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Download, Film, Music, Pause, Play, Share2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MUSIC_BUCKET, MUSIC_SIGNED_SECONDS, formatDuration, musicChoiceKey, parseMusicChoice, resolveMusicChoice, serializeMusicChoice, type MusicChoice, type MusicTrack } from "@/lib/video-music";
import { canShareFiles } from "@/lib/share";
import { shareFilesFromPhone, useShareLogger } from "@/lib/share-client";
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

export function PropertyVideoCard({ photos, listing, propertyId, shareText = "", initialFormat = "vertical", onResult }: { photos: Photo[]; listing: VideoListing; propertyId: string; shareText?: string; initialFormat?: VideoFormat; onResult?: (r: { blob: Blob; name: string; format: VideoFormat; musicTrackId: string | null; videoInfo: import("@/lib/meta/post-core").ReelVideoInfo | null }) => void }) {
  const logShare = useShareLogger(propertyId);
  const [phoneShare, setPhoneShare] = useState(false);
  useEffect(() => { setPhoneShare(canShareFiles(navigator)); }, []);
  const [format, setFormat] = useState<VideoFormat>(initialFormat);
  const [order, setOrder] = useState<string[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [perPhoto, setPerPhoto] = useState(VIDEO_DEFAULT_PER_PHOTO);
  const [music, setMusic] = useState<File | null>(null);
  const [choice, setChoiceState] = useState<MusicChoice>({ kind: "none" });
  const [userKey, setUserKey] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksQ = useQuery({
    queryKey: ["video-music", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("video_music_tracks").select("id,title,style,artist,duration_sec,storage_path,active,position").eq("active", true).order("position").order("created_at");
      if (error) throw error;
      return (data ?? []) as MusicTrack[];
    },
  });
  const tracks = tracksQ.data ?? [];
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => setUserKey(musicChoiceKey(data.session?.user.id ?? null))); }, []);
  useEffect(() => {
    if (!userKey || !tracksQ.data) return;
    setChoiceState(resolveMusicChoice(parseMusicChoice(localStorage.getItem(userKey)), tracksQ.data.map((t) => t.id)));
  }, [userKey, tracksQ.data]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  const setChoice = (c: MusicChoice) => {
    setChoiceState(c);
    if (userKey) localStorage.setItem(userKey, serializeMusicChoice(c));
  };
  const trackUrl = async (t: MusicTrack) => {
    const { data } = await supabase.storage.from(MUSIC_BUCKET).createSignedUrl(t.storage_path, MUSIC_SIGNED_SECONDS);
    if (!data?.signedUrl) throw new Error("TRACK");
    return data.signedUrl;
  };
  const togglePlay = async (t: MusicTrack) => {
    audioRef.current?.pause();
    if (playing === t.id) return setPlaying(null);
    try {
      const a = new Audio(await trackUrl(t));
      audioRef.current = a; a.onended = () => setPlaying(null);
      await a.play(); setPlaying(t.id);
    } catch { setPlaying(null); setError("Piesa nu a putut fi redată."); }
  };
  const [opts, setOpts] = useState({ showLogo: true, showPhone: true, showPrice: true });
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; webm: boolean; blob: Blob } | null>(null);
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
    audioRef.current?.pause(); setPlaying(null);
    try {
      const track = choice.kind === "track" ? tracks.find((t) => t.id === choice.id) ?? null : null;
      let audio: Blob | null = choice.kind === "own" ? music : null;
      if (track) {
        const res = await fetch(await trackUrl(track), { signal: ctrl.signal });
        if (!res.ok) throw new Error("TRACK");
        audio = await res.blob();
      }
      const { renderPropertyVideo } = await import("@/lib/property-video-render");
      const r = await renderPropertyVideo({
        format, perPhoto: plan.perPhoto, music: audio, signal: ctrl.signal, onProgress: setProgress,
        photoUrls: chosen.map((id) => byId.get(id)!.url),
        overlay: buildVideoOverlay({ ...listing, logoUrl: hasLogo ? listing.logoUrl : null }, { ...opts, showLogo: opts.showLogo && hasLogo }),
      });
      setResult({ url: URL.createObjectURL(r.blob), name: videoFileName(listing.reference, format, r.ext), webm: r.ext === "webm", blob: r.blob });
      const videoInfo = await (await import("@/lib/meta/reel-video")).inspectReelVideo(r.blob).catch(() => null);
      onResult?.({ blob: r.blob, name: videoFileName(listing.reference, format, r.ext), format, musicTrackId: track?.id ?? null, videoInfo });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message === "TRACK" ? "Piesa aleasă nu a putut fi încărcată. Încearcă din nou." : (e as Error).message === "UNSUPPORTED"
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
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Muzică</legend>
        <div className="grid gap-2" role="radiogroup" aria-label="Muzică">
          <MusicOption checked={choice.kind === "none"} onSelect={() => setChoice({ kind: "none" })} title="Fără muzică" />
          {tracks.map((t) => (
            <MusicOption key={t.id} checked={choice.kind === "track" && choice.id === t.id} onSelect={() => setChoice({ kind: "track", id: t.id })}
              title={t.title} meta={`${t.style} · ${formatDuration(t.duration_sec)}`}
              action={<Button type="button" size="icon" variant="ghost" aria-label={playing === t.id ? `Oprește ${t.title}` : `Ascultă ${t.title}`} onClick={(e) => { e.stopPropagation(); void togglePlay(t); }}>{playing === t.id ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>} />
          ))}
          <MusicOption checked={choice.kind === "own"} onSelect={() => setChoice({ kind: "own" })} title="Muzica ta (MP3)" />
        </div>
        {choice.kind === "own" ? (
          <div className="space-y-1 rounded-control border border-border p-3">
            <Label htmlFor="video-music">Fișier MP3, max. 10 MB</Label>
            <div className="flex items-center gap-2">
              <input id="video-music" type="file" accept="audio/mpeg,.mp3" className="block w-full text-sm file:mr-3 file:rounded-control file:border file:border-border file:bg-muted file:px-3 file:py-1.5" onChange={(e) => pickMusic(e.target.files?.[0])} />
              {music ? <Button type="button" size="icon" variant="ghost" aria-label="Elimină muzica" onClick={() => setMusic(null)}><X className="size-4" /></Button> : null}
            </div>
            <p className="text-xs text-muted-foreground">Folosește doar muzică pentru care ai drept de utilizare.</p>
            {music ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><Music className="size-3" />{music.name}</p> : null}
          </div>
        ) : null}
        {choice.kind !== "none" ? <p className="text-xs text-muted-foreground">Muzica se taie la lungimea video-ului, cu fade-out de 2 s.</p> : null}
      </fieldset>

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
          {phoneShare ? (
            <Button type="button" variant="outline" className="ml-2" onClick={() => void shareFilesFromPhone([new File([result.blob], result.name, { type: result.blob.type })], shareText, () => logShare("Distribuit din telefon"))}>
              <Share2 className="size-4" /> Distribuie video-ul
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MusicOption({ checked, onSelect, title, meta, action }: { checked: boolean; onSelect: () => void; title: string; meta?: string; action?: ReactNode }) {
  return (
    <div role="radio" aria-checked={checked} tabIndex={0} onClick={onSelect} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onSelect(); } }}
      className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-control border p-2 text-sm", checked ? "border-primary bg-accent" : "border-border")}>
      <span className={cn("size-4 shrink-0 rounded-full border", checked ? "border-4 border-primary" : "border-border")} aria-hidden />
      <span className="flex-1"><span className="font-medium">{title}</span>{meta ? <span className="block text-xs text-muted-foreground">{meta}</span> : null}</span>
      {action}
    </div>
  );
}
