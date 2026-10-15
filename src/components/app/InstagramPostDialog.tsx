import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
import { publishInstagramPost } from "@/lib/meta/instagram.functions";
import type { MetaPostingContext } from "@/lib/meta/post.functions";
import {
  IG_ALBUM_MAX, IG_ALBUM_MIN, IG_CAPTION_MAX, IG_HASHTAGS_MAX,
  buildInstagramCaption, countHashtags, validateInstagramCaption, type IgPostKind, type IgRatio,
} from "@/lib/meta/instagram-core";
import { toInstagramJpeg, urlToInstagramJpeg } from "@/lib/meta/instagram-image";
import { getLatestPoster, subscribePosters } from "@/lib/poster-store";

const KINDS: { value: IgPostKind; label: string }[] = [
  { value: "ig_poster", label: "Poster în feed" },
  { value: "ig_album", label: "Poze ca album" },
  { value: "ig_photo", label: "O poză" },
  { value: "ig_reel", label: "Video ca Reel" },
  { value: "ig_story", label: "Story" },
];

function Pills<T extends string>(p: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={p.label}>
      {p.options.map((k) => (
        <button key={k.value} type="button" role="radio" aria-checked={p.value === k.value} onClick={() => p.onChange(k.value)}
          className={cn("rounded-pill border px-3 py-1 text-sm", p.value === k.value ? "border-primary bg-gold-tint font-semibold text-gold-dark" : "border-border text-muted-foreground")}>
          {k.label}
        </button>
      ))}
    </div>
  );
}

export function InstagramPostDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  ctx: MetaPostingContext;
  initialText: string;
  photos: { id: string; url: string }[];
  video: Blob | null;
  videoVertical: boolean;
  onCreatePoster: () => void;
  onCreateVideo: () => void;
  onPosted: () => void;
}) {
  const publish = useServerFn(publishInstagramPost);
  const [account, setAccount] = useState("");
  const [kind, setKind] = useState<IgPostKind>("ig_poster");
  const [ratio, setRatio] = useState<IgRatio>("4:5");
  const [storySource, setStorySource] = useState<"poster" | "video">("poster");
  const [text, setText] = useState("");
  const poster = useSyncExternalStore(subscribePosters, () => getLatestPoster(props.propertyId), () => null);
  const photos = props.photos.slice(0, IG_ALBUM_MAX);

  useEffect(() => {
    if (!props.open) return;
    setAccount(props.ctx.instagram[0]?.igUserId ?? "");
    setText(buildInstagramCaption(props.initialText, props.ctx.agentPhone));
    setKind("ig_poster");
  }, [props.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const caption = useMemo(() => buildInstagramCaption(text, props.ctx.agentPhone), [text, props.ctx.agentPhone]);
  const capErr = validateInstagramCaption(caption);
  const tags = countHashtags(caption);
  const verticalVideo = props.video && props.videoVertical ? props.video : null;

  const missing =
    kind === "ig_poster" ? (!poster ? "Creează întâi posterul." : null)
    : kind === "ig_album" ? (photos.length < IG_ALBUM_MIN ? `Selectează ${IG_ALBUM_MIN}–${IG_ALBUM_MAX} poze în secțiunea „Postare pe rețele sociale”.` : null)
    : kind === "ig_photo" ? (!photos.length ? "Selectează o poză în secțiunea „Postare pe rețele sociale”." : null)
    : kind === "ig_reel" ? (!verticalVideo ? "Creează întâi video-ul în format vertical." : null)
    : storySource === "poster" ? (!poster ? "Creează întâi posterul." : null) : (!verticalVideo ? "Creează întâi video-ul în format vertical." : null);

  const m = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.set("propertyId", props.propertyId);
      fd.set("igUserId", account);
      fd.set("kind", kind);
      fd.set("caption", caption);
      if (kind === "ig_poster" && poster) fd.append("images", await toInstagramJpeg(poster, ratio), "poster.jpg");
      if (kind === "ig_story" && storySource === "poster" && poster) fd.append("images", await toInstagramJpeg(poster, null), "story.jpg");
      if (kind === "ig_photo") fd.append("images", await urlToInstagramJpeg(photos[0]!.url, ratio), "foto.jpg");
      if (kind === "ig_album") {
        for (const [i, p] of photos.entries()) fd.append("images", await urlToInstagramJpeg(p.url, ratio), `foto-${i + 1}.jpg`);
      }
      if ((kind === "ig_reel" || (kind === "ig_story" && storySource === "video")) && verticalVideo) fd.set("video", verticalVideo, "video.mp4");
      return publish({ data: fd });
    },
    onSuccess: (r) => {
      if (!r.ok) return void toast.error(r.error);
      if (r.background) toast.info("Instagram încă procesează video-ul. Primești o notificare când postarea e gata.");
      else toast.success(`Postat pe @${r.username ?? ""}.`);
      props.onPosted();
      props.onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Postarea nu a reușit."),
  });

  const showRatio = kind === "ig_poster" || kind === "ig_album" || kind === "ig_photo";
  const needsPoster = (kind === "ig_poster" || (kind === "ig_story" && storySource === "poster")) && !poster;
  const needsVideo = (kind === "ig_reel" || (kind === "ig_story" && storySource === "video")) && !verticalVideo;

  return (
    <Dialog open={props.open} onOpenChange={(v) => !m.isPending && props.onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Postează pe Instagram</DialogTitle>
          <DialogDescription>Se publică imediat pe contul ales.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Contul</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger aria-label="Contul"><SelectValue placeholder="Alege contul" /></SelectTrigger>
              <SelectContent>
                {props.ctx.instagram.map((a) => <SelectItem key={a.igUserId} value={a.igUserId}>@{a.username ?? a.igUserId}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ce postezi</Label>
            <Pills label="Ce postezi" value={kind} options={KINDS} onChange={setKind} />
            {kind === "ig_story" ? (
              <Pills label="Story din" value={storySource} options={[{ value: "poster", label: "Poster" }, { value: "video", label: "Video vertical" }]} onChange={setStorySource} />
            ) : null}
            {missing ? <p className="text-xs text-muted-foreground">{missing}</p> : kind === "ig_album" ? <p className="text-xs text-muted-foreground">{photos.length} poze în album.</p> : null}
            {needsPoster ? <Button size="sm" variant="outline" onClick={props.onCreatePoster}>Creează poster</Button> : null}
            {needsVideo ? <Button size="sm" variant="outline" onClick={props.onCreateVideo}>Creează video</Button> : null}
          </div>
          {showRatio ? (
            <div className="space-y-1.5">
              <Label>Formatul pozelor</Label>
              <Pills label="Formatul pozelor" value={ratio} options={[{ value: "4:5", label: "Portret 4:5" }, { value: "1:1", label: "Pătrat 1:1" }]} onChange={setRatio} />
            </div>
          ) : null}
          {kind !== "ig_story" ? (
            <div className="space-y-1.5">
              <Label htmlFor="ig-post-text">Descrierea</Label>
              <Textarea id="ig-post-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
              <p className={cn("text-xs", capErr ? "text-destructive" : "text-muted-foreground")}>
                {caption.length}/{IG_CAPTION_MAX} caractere · {tags}/{IG_HASHTAGS_MAX} hashtaguri. Linkurile nu sunt clicabile pe Instagram; la final apare „Detalii: telefonul agentului”.
              </p>
              {capErr ? <p className="text-xs text-destructive">{capErr}</p> : null}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={() => m.mutate()} disabled={m.isPending || !account || !!missing || (kind !== "ig_story" && !!capErr)}>
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Publică acum
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
