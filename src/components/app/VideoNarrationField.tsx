import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildNarrationText, narrationWordCount, narrationWordLimit, NARRATION_VOICES, validateNarration, type NarrationItem, type NarrationVoice } from "@/lib/video-narration";
import { startVideoNarration, refreshVideoNarration } from "@/lib/video-narration.functions";
import type { VideoListing } from "@/lib/property-video";

export function VideoNarrationField({ listing, propertyId, seconds, showPrice, disabled, onAudio }: { listing: VideoListing; propertyId: string; seconds: number; showPrice: boolean; disabled: boolean; onAudio: (audio: Blob | null) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState(() => buildNarrationText(listing, showPrice, seconds));
  const [voice, setVoice] = useState<NarrationVoice>("female");
  const [item, setItem] = useState<NarrationItem | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const edited = useRef(false), lock = useRef(false), mounted = useRef(true);
  const start = useServerFn(startVideoNarration), refresh = useServerFn(refreshVideoNarration);
  const invalid = validateNarration(text, seconds);
  const latest = useRef({ text, voice, seconds, enabled }); latest.current = { text, voice, seconds, enabled };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!edited.current) setText(buildNarrationText(listing, showPrice, seconds)); }, [listing, showPrice, seconds]);
  useEffect(() => { setItem(null); setAudioUrl(null); onAudio(null); }, [text, voice, seconds, enabled, showPrice, onAudio]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  const generate = async () => {
    if (lock.current || invalid) return;
    lock.current = true; setBusy(true); setError(null);
    const snapshot = { text, voice, seconds };
    try {
      let result = await start({ data: { propertyId, requestKey: crypto.randomUUID(), ...snapshot } });
      const deadline = Date.now() + 10 * 60_000;
      while (result.ok && result.item.status === "running" && mounted.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        if (!mounted.current) return;
        result = await refresh({ data: { propertyId, id: result.item.id } });
      }
      if (!mounted.current) return;
      if (!result.ok) throw new Error(result.message);
      if (result.item.status !== "succeeded" || !result.item.outputUrl) throw new Error(result.item.error ?? "Generarea a depășit timpul de așteptare.");
      const response = await fetch(result.item.outputUrl);
      if (!response.ok) throw new Error("Vocea nu a putut fi încărcată.");
      const blob = await response.blob();
      if (!mounted.current || latest.current.text !== snapshot.text || latest.current.voice !== snapshot.voice || latest.current.seconds !== snapshot.seconds || !latest.current.enabled) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      try {
        await new Promise<void>((resolve, reject) => { audio.onloadedmetadata = () => resolve(); audio.onerror = () => reject(new Error("Fișierul audio nu poate fi redat.")); audio.load(); });
        if (!Number.isFinite(audio.duration) || audio.duration > seconds + 0.1) throw new Error("Vocea este mai lungă decât clipul. Scurtează textul sau mărește durata.");
      } catch (e) { URL.revokeObjectURL(url); throw e; }
      setItem(result.item); setAudioUrl(url); onAudio(blob);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Generarea vocii a eșuat."); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  return <fieldset className="space-y-3 border-t border-border pt-4">
    <Label className="flex items-center gap-2"><Checkbox checked={enabled} disabled={disabled || busy} onCheckedChange={(v) => setEnabled(v === true)} />Narațiune</Label>
    {enabled ? <>
      <Label htmlFor={`narration-${propertyId}`}>Text narațiune</Label>
      <Textarea id={`narration-${propertyId}`} className="min-h-24 text-base" value={text} maxLength={4000} disabled={busy || disabled} onChange={(e) => { edited.current = true; setText(e.target.value); }} />
      <p className={invalid ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{narrationWordCount(text)}/{narrationWordLimit(seconds)} cuvinte · {seconds} s</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Voce narațiune">{(Object.keys(NARRATION_VOICES) as NarrationVoice[]).map((v) => <Button key={v} type="button" variant={voice === v ? "default" : "outline"} aria-pressed={voice === v} disabled={busy || disabled} onClick={() => setVoice(v)}>{NARRATION_VOICES[v].label}</Button>)}</div>
      <Button type="button" variant="outline" onClick={() => void generate()} disabled={busy || disabled || Boolean(invalid)}><Mic className="size-4" />{busy ? "Se generează vocea…" : "Generează vocea"}</Button>
      {invalid ? <p role="alert" className="text-sm text-destructive">{invalid}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {item && audioUrl ? <div className="flex flex-wrap items-center gap-2"><audio aria-label="Previzualizare narațiune" controls preload="metadata" src={audioUrl} className="max-w-full" /><Button type="button" size="icon" variant="ghost" aria-label="Elimină vocea" disabled={disabled} onClick={() => { setItem(null); setAudioUrl(null); onAudio(null); }}><X className="size-4" /></Button></div> : null}
    </> : null}
  </fieldset>;
}