import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { getFacebookReelProgress, publishMetaPost, type MetaPostingContext } from "@/lib/meta/post.functions";
import { META_POST_MAX_PHOTOS, META_REEL_PROCESSING_MESSAGE, reelVideoError, withOfferLink, type MetaPostKind, type ReelVideoInfo } from "@/lib/meta/post-core";
import { getLatestPoster, subscribePosters } from "@/lib/poster-store";

const KINDS: { value: MetaPostKind; label: string }[] = [
  { value: "photos", label: "Poze" },
  { value: "poster", label: "Poster" },
  { value: "video", label: "Video" },
  { value: "reel", label: "Reel" },
  { value: "link", label: "Doar link" },
];

export function MetaPostDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  ctx: MetaPostingContext;
  initialText: string;
  photos: { id: string; url: string }[];
  video: Blob | null;
  videoInfo?: ReelVideoInfo | null;
  musicTrackId?: string | null;
  onCreatePoster: () => void;
  onCreateVideo: () => void;
  onCreateVerticalVideo: () => void;
  onPosted: () => void;
}) {
  const publish = useServerFn(publishMetaPost);
  const progress = useServerFn(getFacebookReelProgress);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const submissionLock = useRef(false);
  const reelError = reelVideoError(props.videoInfo ?? null, props.video);
  const progressQ = useQuery({ queryKey: ["facebook-reel-progress", processingId], enabled: Boolean(processingId && props.open), queryFn: () => {
    if (!processingId) throw new Error("Lipsește postarea.");
    return progress({ data: { propertyId: props.propertyId, postId: processingId } });
  }, refetchInterval: 5000 });
  const [pageId, setPageId] = useState("");
  const [kind, setKind] = useState<MetaPostKind>("photos");
  const [text, setText] = useState("");
  const poster = useSyncExternalStore(subscribePosters, () => getLatestPoster(props.propertyId), () => null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const photos = props.photos.slice(0, META_POST_MAX_PHOTOS);

  useEffect(() => {
    if (!props.open) return;
    setPageId(props.ctx.pages.find((p) => p.pageId === props.ctx.defaultPageId)?.pageId ?? props.ctx.pages[0]?.pageId ?? "");
    setText(props.initialText);
    setKind(reelError === null ? "reel" : "photos");
  }, [props.open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!poster) return setPosterUrl(null);
    const u = URL.createObjectURL(poster);
    setPosterUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [poster]);

  const m = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.set("propertyId", props.propertyId);
      fd.set("pageId", pageId);
      fd.set("kind", kind);
      fd.set("message", text);
      fd.set("photoIds", JSON.stringify(kind === "photos" ? photos.map((p) => p.id) : []));
      if (kind === "poster" && poster) fd.set("file", poster, "poster.png");
      if ((kind === "video" || kind === "reel") && props.video) { fd.set("file", props.video, "video.mp4"); if (props.musicTrackId) fd.set("musicTrackId", props.musicTrackId); }
      return publish({ data: fd });
    },
    onSuccess: (r) => {
      if (!r.ok) return void toast.error(r.error);
      if ("processing" in r && r.processing) { setProcessingId(r.postRecordId); toast.info(META_REEL_PROCESSING_MESSAGE); return; }
      toast.success(`Postat pe ${r.pageName}.`);
      props.onPosted();
      props.onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Postarea nu a reușit."),
    onSettled: () => { submissionLock.current = false; },
  });

  useEffect(() => {
    const result = progressQ.data;
    if (!processingId || !result || !["published", "failed"].includes(result.status)) return;
    setProcessingId(null);
    props.onPosted();
    if (result.status === "failed") toast.error(result.error ?? "Facebook a respins Reel-ul.");
    else { toast.success(`Postat pe ${result.pageName}.`); props.onOpenChange(false); }
  }, [progressQ.data, processingId]);

  const missing =
    kind === "photos" ? photos.length === 0 : kind === "poster" ? !poster : kind === "video" ? !props.video : kind === "reel" ? Boolean(reelError) : false;
  const finalText = withOfferLink(text, props.propertyId);

  return (
    <Dialog open={props.open} onOpenChange={(v) => !m.isPending && props.onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Postează pe Facebook</DialogTitle>
          <DialogDescription>Se publică imediat pe pagina aleasă.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Pagina</Label>
            <Select value={pageId} onValueChange={setPageId}>
              <SelectTrigger aria-label="Pagina"><SelectValue placeholder="Alege pagina" /></SelectTrigger>
              <SelectContent>
                {props.ctx.pages.map((p) => <SelectItem key={p.pageId} value={p.pageId}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ce postezi</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ce postezi">
              {KINDS.map((k) => (
                <Button key={k.value} variant="outline" type="button" role="radio" aria-checked={kind === k.value} disabled={m.isPending || Boolean(processingId)} onClick={() => setKind(k.value)}
                  className={cn("rounded-pill border px-3 py-1 text-sm", kind === k.value ? "border-primary bg-gold-tint font-semibold text-gold-dark" : "border-border text-muted-foreground")}>
                  {k.label}
                </Button>
              ))}
            </div>
            {kind === "reel" && reelError ? (
              <div className="space-y-2"><p className="text-sm text-muted-foreground">Pentru Reel, generează video-ul vertical</p>
                {reelError !== "Pentru Reel, generează video-ul vertical" ? <p className="text-xs text-destructive">{reelError}</p> : null}
                <Button size="sm" variant="outline" onClick={props.onCreateVerticalVideo}>Creează video vertical</Button>
              </div>
            ) : kind === "photos" ? (
              <p className="text-xs text-muted-foreground">{photos.length ? `${photos.length} poze selectate în secțiunea de postare.` : "Selectează poze în secțiunea „Postare pe rețele sociale”."}</p>
            ) : kind === "poster" && !poster ? (
              <Button size="sm" variant="outline" onClick={props.onCreatePoster}>Creează poster</Button>
            ) : kind === "video" && !props.video ? (
              <Button size="sm" variant="outline" onClick={props.onCreateVideo}>Creează video</Button>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-post-text">Text</Label>
            <Textarea id="meta-post-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="text-xs text-muted-foreground">Linkul ofertei se adaugă automat la final.</p>
            {kind === "reel" ? <p className="text-xs text-muted-foreground">În Reels, linkul din descriere nu e clickabil.</p> : null}
          </div>
          <div className="overflow-hidden rounded-xl border border-border" aria-label="Previzualizare">
            <p className="px-3 py-2 text-sm font-semibold">{props.ctx.pages.find((p) => p.pageId === pageId)?.name}</p>
            <p className="max-h-40 overflow-y-auto whitespace-pre-line px-3 pb-2 text-sm">{finalText}</p>
            {kind === "photos" && photos.length ? (
              <div className="grid grid-cols-3 gap-0.5">{photos.slice(0, 6).map((p) => <img key={p.id} src={p.url} alt="" className="aspect-square w-full object-cover" />)}</div>
            ) : kind === "poster" && posterUrl ? (
              <img src={posterUrl} alt="Poster" className="w-full" />
            ) : (kind === "video" || kind === "reel") && props.video ? (
              <p className="bg-muted px-3 py-6 text-center text-sm text-muted-foreground">Video ({Math.round(props.video.size / 1024 / 1024)} MB)</p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { if (submissionLock.current || processingId) return; submissionLock.current = true; m.mutate(); }} disabled={m.isPending || Boolean(processingId) || !pageId || missing}>
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Publică acum
            </Button>
          </div>
          {kind === "reel" && (m.isPending || processingId) ? <p role="status" className="text-sm text-muted-foreground">{META_REEL_PROCESSING_MESSAGE}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
