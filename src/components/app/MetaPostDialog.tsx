import { useEffect, useState, useSyncExternalStore } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { publishMetaPost, type MetaPostingContext } from "@/lib/meta/post.functions";
import { META_POST_MAX_PHOTOS, withOfferLink, type MetaPostKind } from "@/lib/meta/post-core";
import { getLatestPoster, subscribePosters } from "@/lib/poster-store";

const KINDS: { value: MetaPostKind; label: string }[] = [
  { value: "photos", label: "Poze" },
  { value: "poster", label: "Poster" },
  { value: "video", label: "Video" },
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
  onCreatePoster: () => void;
  onCreateVideo: () => void;
  onPosted: () => void;
}) {
  const publish = useServerFn(publishMetaPost);
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
    setKind("photos");
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
      if (kind === "video" && props.video) fd.set("file", props.video, "video.mp4");
      return publish({ data: fd });
    },
    onSuccess: (r) => {
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Postat pe ${r.pageName}.`);
      props.onPosted();
      props.onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Postarea nu a reușit."),
  });

  const missing =
    kind === "photos" ? photos.length === 0 : kind === "poster" ? !poster : kind === "video" ? !props.video : false;
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
                <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} onClick={() => setKind(k.value)}
                  className={cn("rounded-pill border px-3 py-1 text-sm", kind === k.value ? "border-primary bg-gold-tint font-semibold text-gold-dark" : "border-border text-muted-foreground")}>
                  {k.label}
                </button>
              ))}
            </div>
            {kind === "photos" ? (
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
          </div>
          <div className="overflow-hidden rounded-xl border border-border" aria-label="Previzualizare">
            <p className="px-3 py-2 text-sm font-semibold">{props.ctx.pages.find((p) => p.pageId === pageId)?.name}</p>
            <p className="max-h-40 overflow-y-auto whitespace-pre-line px-3 pb-2 text-sm">{finalText}</p>
            {kind === "photos" && photos.length ? (
              <div className="grid grid-cols-3 gap-0.5">{photos.slice(0, 6).map((p) => <img key={p.id} src={p.url} alt="" className="aspect-square w-full object-cover" />)}</div>
            ) : kind === "poster" && posterUrl ? (
              <img src={posterUrl} alt="Poster" className="w-full" />
            ) : kind === "video" && props.video ? (
              <p className="bg-muted px-3 py-6 text-center text-sm text-muted-foreground">Video ({Math.round(props.video.size / 1024 / 1024)} MB)</p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => m.mutate()} disabled={m.isPending || !pageId || missing}>
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Publică acum
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
