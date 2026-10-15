import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/sonner";
import {
  YT_DESCRIPTION_MAX,
  YT_PENDING_APPROVAL_MESSAGE,
  YT_TITLE_MAX,
  YT_VIDEO_MAX_BYTES,
  youtubeDescription,
  youtubeTags,
  youtubeTitle,
  type YtPrivacy,
} from "@/lib/youtube/core";
import {
  failYoutubeUpload,
  finishYoutubeUpload,
  startYoutubeUpload,
  uploadYoutubeViaServer,
  type YoutubePostingContext,
} from "@/lib/youtube/youtube.functions";

/** PUT direct la sesiunea YouTube, cu progres; null dacă browserul e blocat (CORS/rețea). */
function putDirect(url: string, file: Blob, onProgress: (p: number) => void): Promise<{ id?: string; status: number } | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "video/mp4");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 95));
    xhr.onerror = () => resolve(null);
    xhr.onload = () => {
      let id: string | undefined;
      try { id = (JSON.parse(xhr.responseText) as { id?: string }).id; } catch { /* ignore */ }
      resolve({ id, status: xhr.status });
    };
    xhr.send(file);
  });
}

export function YoutubePostDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  ctx: YoutubePostingContext;
  listingTitle: string;
  price: string | null;
  initialText: string;
  hashtags: string[];
  video: Blob | null;
  musicTrackId?: string | null;
  onCreateVideo: () => void;
  onPosted: () => void;
}) {
  const start = useServerFn(startYoutubeUpload);
  const finish = useServerFn(finishYoutubeUpload);
  const viaServer = useServerFn(uploadYoutubeViaServer);
  const fail = useServerFn(failYoutubeUpload);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<YtPrivacy>("public");
  const [progress, setProgress] = useState(0);
  const tags = useMemo(() => youtubeTags(props.hashtags), [props.hashtags]);

  useEffect(() => {
    if (!props.open) return;
    setTitle(youtubeTitle(props.listingTitle, props.price));
    const body = props.initialText.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    setDescription(youtubeDescription(body, props.propertyId));
    setPrivacy("public");
    setProgress(0);
  }, [props.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMutation({
    mutationFn: async () => {
      const file = props.video!;
      if (file.size > YT_VIDEO_MAX_BYTES) throw new Error("Video-ul depășește 100 MB.");
      setProgress(2);
      const s = await start({ data: { propertyId: props.propertyId, title, description, tags, privacy, size: file.size, musicTrackId: props.musicTrackId ?? null } });
      if (!s.ok) throw new Error(s.error);
      const direct = await putDirect(s.uploadUrl, file, setProgress);
      let res;
      if (direct?.id && direct.status < 300) {
        res = await finish({ data: { rowId: s.rowId, videoId: direct.id } });
      } else if (direct === null) {
        setProgress(50);
        const fd = new FormData();
        fd.set("rowId", s.rowId);
        fd.set("file", file, "video.mp4");
        res = await viaServer({ data: fd });
      } else {
        await fail({ data: { rowId: s.rowId, message: "YouTube a respins încărcarea." } }).catch(() => undefined);
        throw new Error(direct.status === 403 ? "Limita zilnică YouTube a fost depășită sau accesul a fost refuzat." : "YouTube a respins video-ul.");
      }
      if (!res.ok) throw new Error(res.error);
      setProgress(100);
      return res;
    },
    onSuccess: (r) => {
      toast.success(`Publicat pe ${r.channelTitle ?? "YouTube"}.`);
      props.onPosted();
      props.onOpenChange(false);
    },
    onError: (e: unknown) => {
      setProgress(0);
      toast.error(e instanceof Error ? e.message : "Publicarea nu a reușit.");
      props.onPosted();
    },
  });

  return (
    <Dialog open={props.open} onOpenChange={(v) => !m.isPending && props.onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publică pe YouTube</DialogTitle>
          <DialogDescription>Canal: {props.ctx.channelTitle ?? "—"}</DialogDescription>
        </DialogHeader>
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">{YT_PENDING_APPROVAL_MESSAGE}</p>

        {!props.video ? (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <p>Nu există încă un video generat pentru această proprietate.</p>
            <Button onClick={props.onCreateVideo}>Creează video</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="yt-title">Titlu</Label>
              <Input id="yt-title" value={title} maxLength={YT_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
              <p className="text-xs text-muted-foreground">{title.length}/{YT_TITLE_MAX}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="yt-desc">Descriere</Label>
              <Textarea id="yt-desc" rows={8} value={description} maxLength={YT_DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)} />
              <p className="text-xs text-muted-foreground">{description.length}/{YT_DESCRIPTION_MAX} · linkul ofertei se adaugă automat dacă lipsește</p>
            </div>
            <div className="space-y-1.5">
              <Label>Etichete</Label>
              <p className="text-sm text-muted-foreground">{tags.length ? tags.join(", ") : "—"}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Vizibilitate</Label>
              <Select value={privacy} onValueChange={(v) => setPrivacy(v as YtPrivacy)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="unlisted">Nelistat</SelectItem>
                  <SelectItem value="private">Privat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {m.isPending ? <Progress value={progress} aria-label="Progres încărcare" /> : null}
            <Button className="w-full" onClick={() => m.mutate()} disabled={m.isPending || !title.trim()}>
              {m.isPending ? <><Loader2 className="size-4 animate-spin" /> Se încarcă… {progress}%</> : "Publică acum"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
