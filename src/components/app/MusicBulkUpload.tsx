/** SuperAdmin → Muzică video: încărcare în bloc (max 30 MP3, câte 3 în paralel). */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Pause, Play, Trash2, Upload, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { MUSIC_BUCKET, MUSIC_DEFAULT_LICENSE, MUSIC_LICENSES, MUSIC_OTHER_LICENSE, MUSIC_STYLES, formatDuration } from "@/lib/video-music";
import { BULK_CONCURRENCY, BULK_MAX_FILES, batchSummary, bulkFileError, guessTrackMeta, isDuplicateTrack, parseId3, runBatch, type ExistingTrack } from "@/lib/video-music-bulk";

type Existing = ExistingTrack & { storage_path: string; position: number };
type Status = "ready" | "uploading" | "done" | "failed";
type Item = {
  key: string; file: File; title: string; artist: string; style: string; licenseKind: string; licenseOther: string; active: boolean;
  duration: number | null; error: string | null; duplicate: boolean; include: boolean; status: Status; progress: number; message?: string;
};

function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v); };
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration * 10) / 10 : null);
    a.onerror = () => done(null);
    a.src = url;
  });
}
async function readTags(file: File) {
  try {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    const tags = parseId3(head);
    if (tags.title && tags.artist) return tags;
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 128)).arrayBuffer());
    const v1 = parseId3(tail);
    return { title: tags.title || v1.title, artist: tags.artist || v1.artist };
  } catch { return {}; }
}
const licenseOf = (i: Item) => (i.licenseKind === MUSIC_OTHER_LICENSE ? i.licenseOther.trim() : i.licenseKind);

export function MusicBulkUpload({ open, onOpenChange, existing, onUploaded }: { open: boolean; onOpenChange: (v: boolean) => void; existing: Existing[]; onUploaded: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [style, setStyle] = useState("");
  const [licenseKind, setLicenseKind] = useState<string>(MUSIC_DEFAULT_LICENSE);
  const [licenseOther, setLicenseOther] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [known, setKnown] = useState<ExistingTrack[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Piesele vechi nu au mărimea salvată: o citim din spațiul de stocare.
  useEffect(() => {
    if (!open) return;
    let off = false;
    void supabase.storage.from(MUSIC_BUCKET).list("tracks", { limit: 1000 }).then(({ data }) => {
      const sizes = new Map((data ?? []).map((o) => [`tracks/${o.name}`, Number((o.metadata as { size?: number } | null)?.size) || null]));
      if (!off) setKnown(existing.map((e) => ({ ...e, file_size_bytes: e.file_size_bytes ?? sizes.get(e.storage_path) ?? null })));
    });
    return () => { off = true; };
  }, [open, existing]);

  useEffect(() => { if (!open) { audioRef.current?.pause(); setPlaying(null); } }, [open]);

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const addFiles = async (files: File[]) => {
    setSummary(null);
    const room = BULK_MAX_FILES - items.length;
    if (files.length > room) toast.error(`Maximum ${BULK_MAX_FILES} fișiere pe lot; ${Math.max(0, files.length - room)} au fost ignorate.`);
    const picked = files.slice(0, Math.max(0, room));
    const fresh = await Promise.all(picked.map(async (file): Promise<Item> => {
      const error = bulkFileError(file);
      const [tags, duration] = error ? [{}, null] : await Promise.all([readTags(file), audioDuration(file)]);
      const meta = guessTrackMeta(file.name, tags);
      const others = [...known, ...items.map((i) => ({ original_filename: i.file.name, file_size_bytes: i.file.size, duration_sec: i.duration }))];
      const duplicate = !error && isDuplicateTrack({ name: file.name, size: file.size, duration }, others);
      return { key: crypto.randomUUID(), file, ...meta, style, licenseKind, licenseOther, active, duration, error, duplicate, include: !error && !duplicate, status: "ready", progress: 0 };
    }));
    setItems((l) => [...l, ...fresh]);
  };

  const applyAll = (p: Partial<Item>) => setItems((l) => l.map((i) => (i.status === "done" ? i : { ...i, ...p })));

  const listen = (i: Item) => {
    audioRef.current?.pause();
    if (playing === i.key) return setPlaying(null);
    const url = URL.createObjectURL(i.file);
    const a = new Audio(url); audioRef.current = a;
    a.onended = () => { setPlaying(null); URL.revokeObjectURL(url); };
    void a.play().then(() => setPlaying(i.key)).catch(() => setPlaying(null));
  };

  const uploadAll = async () => {
    const queue = items.filter((i) => i.include && !i.error && i.status !== "done");
    const missing = queue.find((i) => !i.title.trim() || !(MUSIC_STYLES as readonly string[]).includes(i.style) || !licenseOf(i));
    if (missing) { toast.error(`Completează titlul, stilul și licența pentru „${missing.file.name}”.`); return; }
    if (!queue.length) { toast.error("Nu ai niciun fișier de încărcat."); return; }
    setBusy(true); setSummary(null);
    const { data: u } = await supabase.auth.getUser();
    const base = Math.max(0, ...existing.map((r) => r.position + 1));
    const results = await runBatch(queue, async (it, idx) => {
      patch(it.key, { status: "uploading", progress: 10, message: undefined });
      const id = crypto.randomUUID();
      const path = `tracks/${id}.mp3`;
      try {
        const up = await supabase.storage.from(MUSIC_BUCKET).upload(path, it.file, { contentType: "audio/mpeg" });
        if (up.error) throw new Error("Încărcarea MP3 nu a reușit.");
        patch(it.key, { progress: 80 });
        const { error } = await supabase.from("video_music_tracks").insert({
          id, title: it.title.trim().slice(0, 120), style: it.style, artist: it.artist.trim() || null, source_url: "",
          license: licenseOf(it), storage_path: path, duration_sec: it.duration, certificate_path: null, content_id_checked: false,
          active: it.active, position: base + idx, created_by: u.user?.id ?? null, original_filename: it.file.name, file_size_bytes: it.file.size,
        });
        if (error) { await supabase.storage.from(MUSIC_BUCKET).remove([path]); throw new Error("Salvarea piesei nu a reușit."); }
        patch(it.key, { status: "done", progress: 100 });
      } catch (e) {
        patch(it.key, { status: "failed", progress: 0, message: e instanceof Error ? e.message : "Eroare" });
        throw e;
      }
    }, BULK_CONCURRENCY);
    const ok = results.filter((r) => r.ok).length;
    const text = batchSummary(ok, items.length - queue.length, results.length - ok);
    setSummary(text); setBusy(false);
    if (ok) onUploaded();
    toast(text);
  };

  const pending = items.filter((i) => i.include && !i.error && i.status !== "done").length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) { setItems([]); setSummary(null); } } }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Încarcă mai multe piese</DialogTitle>
          <DialogDescription>Maximum {BULK_MAX_FILES} fișiere MP3 pe lot, fiecare de cel mult 10 MB.</DialogDescription>
        </DialogHeader>

        <div
          role="button" tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(Array.from(e.dataTransfer.files)); }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm ${drag ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <Upload className="size-6 text-muted-foreground" />
          <span>Trage aici fișierele MP3 sau apasă pentru a le alege</span>
          <input ref={inputRef} type="file" multiple accept="audio/mpeg,.mp3" className="hidden" aria-label="Alege fișiere MP3" onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </div>

        <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-4">
          <div className="space-y-1"><Label>Stil (pentru tot lotul)</Label>
            <Select value={style} onValueChange={(v) => { setStyle(v); applyAll({ style: v }); }}>
              <SelectTrigger aria-label="Stil pentru tot lotul"><SelectValue placeholder="Alege stilul" /></SelectTrigger>
              <SelectContent>{MUSIC_STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Licență (pentru tot lotul)</Label>
            <Select value={licenseKind} onValueChange={(v) => { setLicenseKind(v); applyAll({ licenseKind: v }); }}>
              <SelectTrigger aria-label="Licență pentru tot lotul"><SelectValue /></SelectTrigger>
              <SelectContent>{MUSIC_LICENSES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {licenseKind === MUSIC_OTHER_LICENSE ? (
            <div className="space-y-1"><Label htmlFor="bulk-lic">Numele licenței</Label><Input id="bulk-lic" value={licenseOther} maxLength={120} onChange={(e) => { setLicenseOther(e.target.value); applyAll({ licenseOther: e.target.value }); }} /></div>
          ) : <div />}
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={active} onCheckedChange={(v) => { setActive(v === true); applyAll({ active: v === true }); }} />Activează după încărcare</label>
        </div>

        {items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="p-2">Încarcă</th><th className="p-2">Fișier</th><th className="p-2">Titlu</th><th className="p-2">Artist</th><th className="p-2">Stil</th><th className="p-2">Durată</th><th className="p-2">Activă</th><th className="p-2" /></tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const locked = busy || i.status === "done" || i.status === "uploading";
                  return (
                    <tr key={i.key} className={`border-t align-top ${i.error ? "bg-destructive/5" : i.duplicate ? "bg-warning/10" : ""}`}>
                      <td className="p-2"><Checkbox checked={i.include} disabled={Boolean(i.error) || locked} onCheckedChange={(v) => patch(i.key, { include: v === true })} aria-label={`Încarcă ${i.file.name}`} /></td>
                      <td className="max-w-[180px] p-2">
                        <p className="truncate" title={i.file.name}>{i.file.name}</p>
                        {i.error ? <p className="text-xs font-medium text-destructive">{i.error}</p> : null}
                        {!i.error && i.duplicate ? <p className="text-xs font-medium text-warning-foreground">Există deja{i.include ? " · se încarcă totuși" : " · sărit"}</p> : null}
                        {i.status === "uploading" ? <Progress value={i.progress} className="mt-1 h-1.5" /> : null}
                        {i.status === "done" ? <p className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3" />Încărcată</p> : null}
                        {i.status === "failed" ? <p className="flex items-center gap-1 text-xs text-destructive"><XCircle className="size-3" />{i.message}</p> : null}
                      </td>
                      <td className="p-2"><Input value={i.title} maxLength={120} disabled={locked || Boolean(i.error)} onChange={(e) => patch(i.key, { title: e.target.value })} aria-label={`Titlu ${i.file.name}`} /></td>
                      <td className="p-2"><Input value={i.artist} disabled={locked || Boolean(i.error)} onChange={(e) => patch(i.key, { artist: e.target.value })} aria-label={`Artist ${i.file.name}`} /></td>
                      <td className="p-2 min-w-[130px]">
                        <Select value={i.style} disabled={locked || Boolean(i.error)} onValueChange={(v) => patch(i.key, { style: v })}>
                          <SelectTrigger aria-label={`Stil ${i.file.name}`}><SelectValue placeholder="Stil" /></SelectTrigger>
                          <SelectContent>{MUSIC_STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={i.licenseKind} disabled={locked || Boolean(i.error)} onValueChange={(v) => patch(i.key, { licenseKind: v })}>
                          <SelectTrigger className="mt-1 h-8 text-xs" aria-label={`Licență ${i.file.name}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{MUSIC_LICENSES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                        </Select>
                        {i.licenseKind === MUSIC_OTHER_LICENSE ? <Input className="mt-1 h-8 text-xs" placeholder="Numele licenței" value={i.licenseOther} disabled={locked} onChange={(e) => patch(i.key, { licenseOther: e.target.value })} /> : null}
                      </td>
                      <td className="p-2 whitespace-nowrap">{formatDuration(i.duration)}</td>
                      <td className="p-2"><Checkbox checked={i.active} disabled={locked || Boolean(i.error)} onCheckedChange={(v) => patch(i.key, { active: v === true })} aria-label={`Activă ${i.file.name}`} /></td>
                      <td className="p-2 whitespace-nowrap">
                        <Button size="icon" variant="ghost" disabled={Boolean(i.error)} aria-label={playing === i.key ? `Oprește ${i.file.name}` : `Ascultă ${i.file.name}`} onClick={() => listen(i)}>{playing === i.key ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
                        <Button size="icon" variant="ghost" disabled={locked} aria-label={`Elimină ${i.file.name}`} onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))}><Trash2 className="size-4" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" role="status">{summary ?? (items.length ? `${items.length} fișiere în lot · ${pending} de încărcat` : "")}</p>
          <Button onClick={() => void uploadAll()} disabled={busy || !pending}>{busy ? <><Loader2 className="size-4 animate-spin" />Se încarcă…</> : "Încarcă toate"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
