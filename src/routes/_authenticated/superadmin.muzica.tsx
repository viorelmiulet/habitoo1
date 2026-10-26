/** Superadmin → Muzică video: biblioteca de piese folosite în generatorul video. */
import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FileText, Music2, Pause, Pencil, Play, Sparkles, Trash2, Upload } from "lucide-react";
import { MusicBulkUpload } from "@/components/app/MusicBulkUpload";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { EmptyState } from "@/components/app/EmptyState";
import { appHead } from "@/components/app/app-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import {
  MUSIC_BUCKET, MUSIC_DEFAULT_LICENSE, MUSIC_LICENSES, MUSIC_OTHER_LICENSE, MUSIC_SIGNED_SECONDS, MUSIC_STYLES,
  formatDuration, validateTrackInput,
} from "@/lib/video-music";
import {
  MUSIC_AI_COST_PER_SECOND_USD, MUSIC_AI_DEFAULT_SECONDS, MUSIC_AI_MAX_SECONDS, MUSIC_AI_MIN_SECONDS,
  formatMusicAiCost, validateAiMusicInput,
} from "@/lib/video-music-ai";
import { generateVideoMusic } from "@/lib/video-music-ai.functions";

export const Route = createFileRoute("/_authenticated/superadmin/muzica")({
  head: () => appHead("Habitoo CRM — muzică pentru video"),
  component: SuperadminMusicPage,
});

type Row = {
  id: string; title: string; style: string; artist: string | null; source_url: string; license: string;
  storage_path: string; duration_sec: number | null; certificate_path: string | null; content_id_checked: boolean;
  active: boolean; position: number; original_filename: string | null; file_size_bytes: number | null;
};
type Form = { title: string; style: string; artist: string; sourceUrl: string; licenseKind: string; licenseOther: string };
const EMPTY: Form = { title: "", style: "", artist: "", sourceUrl: "", licenseKind: MUSIC_DEFAULT_LICENSE, licenseOther: "" };
const formLicense = (f: Form) => (f.licenseKind === MUSIC_OTHER_LICENSE ? f.licenseOther.trim() : f.licenseKind);

function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(a.duration) ? Math.round(a.duration * 10) / 10 : null); };
    a.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    a.src = url;
  });
}
const ext = (name: string) => (name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
async function signed(path: string) {
  const { data } = await supabase.storage.from(MUSIC_BUCKET).createSignedUrl(path, MUSIC_SIGNED_SECONDS);
  if (!data?.signedUrl) throw new Error("Fișierul nu a putut fi deschis.");
  return data.signedUrl;
}

function SuperadminMusicPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["superadmin", "video-music"],
    queryFn: async () => {
      const { data, error } = await supabase.from("video_music_tracks").select("*").order("position").order("created_at");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["superadmin", "video-music"] }); void qc.invalidateQueries({ queryKey: ["video-music"] }); };

  const [form, setForm] = useState<Form>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [cert, setCert] = useState<File | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState<Form>(EMPTY);
  const [playing, setPlaying] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const err = validateTrackInput({ title: form.title, style: form.style, sourceUrl: form.sourceUrl, license: formLicense(form), file, certificate: cert, requireFile: true });
      if (err) throw new Error(err);
      const { data: u } = await supabase.auth.getUser();
      const id = crypto.randomUUID();
      const path = `tracks/${id}.mp3`;
      const up = await supabase.storage.from(MUSIC_BUCKET).upload(path, file!, { contentType: "audio/mpeg" });
      if (up.error) throw new Error("Încărcarea MP3 nu a reușit.");
      let certPath: string | null = null;
      if (cert) {
        certPath = `certificates/${id}.${ext(cert.name)}`;
        const c = await supabase.storage.from(MUSIC_BUCKET).upload(certPath, cert, { contentType: cert.type });
        if (c.error) { await supabase.storage.from(MUSIC_BUCKET).remove([path]); throw new Error("Încărcarea certificatului nu a reușit."); }
      }
      const position = Math.max(0, ...(q.data ?? []).map((r) => r.position + 1));
      const { error } = await supabase.from("video_music_tracks").insert({
        id, title: form.title.trim(), style: form.style, artist: form.artist.trim() || null, source_url: form.sourceUrl.trim(),
        license: formLicense(form), storage_path: path, duration_sec: await audioDuration(file!), certificate_path: certPath,
        content_id_checked: false, active: true, position, created_by: u.user?.id ?? null,
        original_filename: file!.name, file_size_bytes: file!.size,
      });
      if (error) { await supabase.storage.from(MUSIC_BUCKET).remove([path, ...(certPath ? [certPath] : [])]); throw error; }
    },
    onSuccess: () => { toast.success("Piesa a fost adăugată."); setForm(EMPTY); setFile(null); setCert(null); setFormKey((k) => k + 1); refresh(); },
    onError: (e) => toastError(e),
  });

  const update = useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Row> }) => {
      const { error } = await supabase.from("video_music_tracks").update(v.patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toastError(e),
  });

  const saveEdit = () => {
    if (!editing) return;
    const err = validateTrackInput({ title: editForm.title, style: editForm.style, sourceUrl: editForm.sourceUrl, license: formLicense(editForm), requireFile: false });
    if (err) { toast.error(err); return; }
    update.mutate({ id: editing.id, patch: { title: editForm.title.trim(), style: editForm.style, artist: editForm.artist.trim() || null, source_url: editForm.sourceUrl.trim(), license: formLicense(editForm) } }, { onSuccess: () => { setEditing(null); toast.success("Piesa a fost salvată."); } });
  };

  const remove = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.from("video_music_tracks").delete().eq("id", r.id);
      if (error) throw error;
      await supabase.storage.from(MUSIC_BUCKET).remove([r.storage_path, ...(r.certificate_path ? [r.certificate_path] : [])]);
    },
    onSuccess: () => { toast.success("Piesa a fost ștearsă."); refresh(); },
    onError: (e) => toastError(e),
  });

  const move = async (i: number, d: number) => {
    const rows = q.data ?? []; const a = rows[i]; const b = rows[i + d];
    if (!a || !b) return;
    const pa = a.position === b.position ? i : a.position; const pb = a.position === b.position ? i + d : b.position;
    await supabase.from("video_music_tracks").update({ position: pb }).eq("id", a.id);
    await supabase.from("video_music_tracks").update({ position: pa }).eq("id", b.id);
    refresh();
  };

  const toggle = async (r: Row) => {
    audioRef.current?.pause();
    if (playing === r.id) return setPlaying(null);
    try {
      const a = new Audio(await signed(r.storage_path)); audioRef.current = a; a.onended = () => setPlaying(null);
      await a.play(); setPlaying(r.id);
    } catch (e) { toastError(e); setPlaying(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Muzică video" description="Piese disponibile agenților în generatorul video. Agenții nu pot descărca piesele separat." />
      <MusicBulkUpload open={bulkOpen} onOpenChange={setBulkOpen} existing={q.data ?? []} onUploaded={refresh} />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0"><CardTitle>Adaugă piesă</CardTitle><Button variant="outline" onClick={() => setBulkOpen(true)} disabled={!q.data}><Upload className="size-4" />Încarcă mai multe</Button></CardHeader>
        <CardContent key={formKey} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="m-file">Fișier MP3 (max. 10 MB)</Label><Input id="m-file" type="file" accept="audio/mpeg,.mp3" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="space-y-1"><Label htmlFor="m-cert">Certificat de descărcare (PDF sau imagine, opțional)</Label><Input id="m-cert" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setCert(e.target.files?.[0] ?? null)} /></div>
          <TrackFields form={form} setForm={setForm} prefix="m" />
          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Durata se detectează automat la încărcare.</p>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Se încarcă…" : "Adaugă piesa"}</Button>
          </div>
        </CardContent>
      </Card>

      {q.isLoading ? <InlineLoading label="Se încarcă piesele…" /> : q.error ? <QueryError error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={Music2} title="Nicio piesă încă" description="Adaugă prima piesă din bibliotecă." />
      ) : (
        <ul className="space-y-2">
          {q.data.map((r, i) => (
            <li key={r.id} className="panel flex flex-wrap items-center gap-3 p-3">
              <Button size="icon" variant="ghost" aria-label={playing === r.id ? `Oprește ${r.title}` : `Ascultă ${r.title}`} onClick={() => void toggle(r)}>{playing === r.id ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.style} · {formatDuration(r.duration_sec)}{r.artist ? ` · ${r.artist}` : ""} · {r.license}{r.source_url ? <> · <a className="underline" href={r.source_url} target="_blank" rel="noopener noreferrer">sursă</a></> : null}{r.certificate_path ? <> · <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => void signed(r.certificate_path!).then((u) => window.open(u, "_blank", "noopener")).catch(toastError)}><FileText className="size-3" />certificat</button></> : null}</p>
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={r.active} onCheckedChange={(v) => update.mutate({ id: r.id, patch: { active: v } })} aria-label={`Activă: ${r.title}`} />{r.active ? "Activă" : "Inactivă"}</label>
              <Button size="icon" variant="ghost" aria-label="Mută mai sus" disabled={i === 0} onClick={() => void move(i, -1)}><ArrowUp className="size-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Mută mai jos" disabled={i === q.data.length - 1} onClick={() => void move(i, 1)}><ArrowDown className="size-4" /></Button>
              <Button size="icon" variant="ghost" aria-label={`Editează ${r.title}`} onClick={() => { setEditing(r); setEditForm({ title: r.title, style: r.style, artist: r.artist ?? "", sourceUrl: r.source_url, licenseKind: (MUSIC_LICENSES as readonly string[]).includes(r.license) ? r.license : MUSIC_OTHER_LICENSE, licenseOther: (MUSIC_LICENSES as readonly string[]).includes(r.license) ? "" : r.license }); }}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="ghost" aria-label={`Șterge ${r.title}`} onClick={() => { if (window.confirm(`Ștergi piesa „${r.title}”?`)) remove.mutate(r); }}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editează piesa</DialogTitle></DialogHeader>
          <div className="grid gap-4"><TrackFields form={editForm} setForm={setEditForm} prefix="e" /></div>
          <div className="flex justify-end"><Button onClick={saveEdit} disabled={update.isPending}>Salvează</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrackFields({ form, setForm, prefix }: { form: Form; setForm: (f: Form) => void; prefix: string }) {
  return (
    <>
      <div className="space-y-1"><Label htmlFor={`${prefix}-title`}>Titlu</Label><Input id={`${prefix}-title`} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
      <div className="space-y-1"><Label>Stil</Label>
        <Select value={form.style} onValueChange={(v) => setForm({ ...form, style: v })}>
          <SelectTrigger aria-label="Stil"><SelectValue placeholder="Alege stilul" /></SelectTrigger>
          <SelectContent>{MUSIC_STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1"><Label htmlFor={`${prefix}-artist`}>Artist</Label><Input id={`${prefix}-artist`} value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`${prefix}-url`}>Link sursă (opțional)</Label><Input id={`${prefix}-url`} type="url" placeholder="https://…" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} /></div>
      <div className="space-y-1"><Label>Licență</Label>
        <Select value={form.licenseKind} onValueChange={(v) => setForm({ ...form, licenseKind: v })}>
          <SelectTrigger aria-label="Licență"><SelectValue /></SelectTrigger>
          <SelectContent>{MUSIC_LICENSES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {form.licenseKind === MUSIC_OTHER_LICENSE ? (
        <div className="space-y-1"><Label htmlFor={`${prefix}-license-other`}>Numele licenței</Label><Input id={`${prefix}-license-other`} value={form.licenseOther} maxLength={120} onChange={(e) => setForm({ ...form, licenseOther: e.target.value })} /></div>
      ) : null}
    </>
  );
}
