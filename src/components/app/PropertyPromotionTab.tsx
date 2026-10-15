import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, Facebook, Film, Image as ImageIcon, Instagram, MessageCircle, Music2, Share2, Sparkles, Youtube } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VIDEO_UPLOAD_URL, videoUploadCopy, videoUploadStep, type VideoUploadNetwork } from "@/lib/share";
import type { VideoFormat } from "@/lib/property-video";
import { SHARE_MAX_PHOTOS, SHARE_NETWORK_LABEL, canShareFiles, offerShareUrl, shareLinks, type ShareNetwork } from "@/lib/share";
import { shareFilesFromPhone, useShareLogger } from "@/lib/share-client";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { getPropertyPromotion } from "@/lib/property-promotion.functions";
import { getMetaPostingContext } from "@/lib/meta/post.functions";
import { MetaPostDialog } from "@/components/app/MetaPostDialog";
import { InstagramPostDialog } from "@/components/app/InstagramPostDialog";
import { YoutubePostDialog } from "@/components/app/YoutubePostDialog";
import { getYoutubePostingContext } from "@/lib/youtube/youtube.functions";
import { IG_NO_ACCOUNT_MESSAGE } from "@/lib/meta/instagram-core";
import { formatDateTime } from "@/lib/format";
import { generateMarketing } from "@/lib/ai/agents/marketing/marketing.functions";
import { MEDIA_BUCKET, signedUrls } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { PropertyVideoCard } from "@/components/app/PropertyVideoCard";
import type { VideoListing } from "@/lib/property-video";
import { facebookListingState } from "@/lib/facebook-catalog-status";
import {
  SOCIAL_CHAR_LIMITS,
  SOCIAL_NETWORKS,
  SOCIAL_NETWORK_LABELS,
  buildSocialPostText,
  defaultPhotoSelection,
  showAiRewrite,
  socialHashtags,
  togglePhotoSelection,
  type SocialNetwork,
} from "@/lib/social-post";

export function PropertyPromotionTab({
  propertyId,
  onOpenPublishing,
  onOpenPoster,
  video,
}: {
  propertyId: string;
  onOpenPublishing?: () => void;
  onOpenPoster?: () => void;
  video?: VideoListing;
}) {
  const load = useServerFn(getPropertyPromotion);
  const runAi = useServerFn(generateMarketing);
  const { isEnabled } = useAiFeatures();
  const q = useQuery({
    queryKey: ["property-promotion", propertyId],
    queryFn: () => load({ data: { propertyId } }),
  });

  const [network, setNetwork] = useState<SocialNetwork>("facebook");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zipping, setZipping] = useState(false);
  const [phoneShare, setPhoneShare] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const logShare = useShareLogger(propertyId);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoFormat, setVideoFormat] = useState<VideoFormat>("vertical");
  const [pendingUpload, setPendingUpload] = useState<VideoUploadNetwork | null>(null);
  const [videoResult, setVideoResult] = useState<{ blob: Blob; name: string; format: VideoFormat; musicTrackId?: string | null } | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [igOpen, setIgOpen] = useState(false);
  const [ytOpen, setYtOpen] = useState(false);
  const loadYt = useServerFn(getYoutubePostingContext);
  const ytQ = useQuery({ queryKey: ["youtube-posting", propertyId], queryFn: () => loadYt({ data: { propertyId } }) });
  const loadMeta = useServerFn(getMetaPostingContext);
  const metaQ = useQuery({ queryKey: ["meta-posting", propertyId], queryFn: () => loadMeta({ data: { propertyId } }) });
  const [pageUrl, setPageUrl] = useState("");
  useEffect(() => { setPageUrl(window.location.href); }, []);
  useEffect(() => { setPhoneShare(canShareFiles(navigator)); }, []);

  const d = q.data;
  useEffect(() => {
    if (d) setText(buildSocialPostText(network, d.post));
  }, [d, network]);
  useEffect(() => {
    if (!d) return;
    setSelected(defaultPhotoSelection(d.photos.map((p) => p.id)));
    const paths = d.photos.map((p) => p.storagePath).filter((v): v is string => Boolean(v));
    void signedUrls(MEDIA_BUCKET, paths).then((map) => {
      const next: Record<string, string> = {};
      for (const p of d.photos) {
        const u = (p.storagePath && map[p.storagePath]) || (p.url?.startsWith("https://") ? p.url : null);
        if (u) next[p.id] = u;
      }
      setUrls(next);
    });
  }, [d]);

  const shareKey = selected.slice(0, SHARE_MAX_PHOTOS).map((id) => urls[id] ?? "").join("|");
  useEffect(() => {
    if (!phoneShare || !shareKey) { setPhotoFiles([]); return; }
    let active = true;
    void Promise.all(shareKey.split("|").filter(Boolean).map(async (u, i) => {
      const res = await fetch(u);
      if (!res.ok) return null;
      const blob = await res.blob();
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      return new File([blob], `foto-${String(i + 1).padStart(2, "0")}.${ext}`, { type: blob.type || "image/jpeg" });
    })).then((files) => { if (active) setPhotoFiles(files.filter((f): f is File => Boolean(f))); }).catch(() => undefined);
    return () => { active = false; };
  }, [phoneShare, shareKey]);

  const ai = useMutation({
    mutationFn: () =>
      runAi({
        data: {
          propertyIds: [propertyId],
          channel: network === "instagram" ? "instagram" : "facebook",
          contentType: "social_post",
          tone: "professional",
          length: network === "instagram" ? "short" : "standard",
        },
      }),
    onSuccess: (res) => {
      const content = res.run?.results?.[0]?.content;
      if (res.status !== "ok" || !content?.body) {
        toast.error(res.message ?? "Textul nu a putut fi generat acum.");
        return;
      }
      const tags = network === "whatsapp" ? [] : (content.hashtags ?? []);
      setText([content.body, tags.join(" ")].filter(Boolean).join("\n\n"));
    },
    onError: () => toast.error("Textul nu a putut fi generat acum."),
  });

  const hashtags = useMemo(() => (d ? socialHashtags(d.post) : []), [d]);

  if (q.isLoading) return <InlineLoading label="Se încarcă promovarea…" />;
  if (q.isError || !d) return <QueryError error={q.error} onRetry={() => q.refetch()} />;

  const limit = SOCIAL_CHAR_LIMITS[network];
  const offerLink = offerShareUrl(propertyId);
  const firstPhoto = selected[0] ? urls[selected[0]] : undefined;

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Textul a fost copiat.");
    } catch {
      toast.error("Copierea nu a funcționat. Selectează manual textul.");
    }
  };

  const downloadZip = async () => {
    setZipping(true);
    try {
      const { zipSync } = await import("fflate");
      const files: Record<string, Uint8Array> = {};
      let n = 0;
      for (const id of selected) {
        const u = urls[id];
        if (!u) continue;
        const res = await fetch(u);
        if (!res.ok) continue;
        n += 1;
        const ext = (res.headers.get("content-type") ?? "").includes("png") ? "png" : res.headers.get("content-type")?.includes("webp") ? "webp" : "jpg";
        files[`${String(n).padStart(2, "0")}.${ext}`] = new Uint8Array(await res.arrayBuffer());
      }
      if (n === 0) throw new Error("empty");
      const blob = new Blob([zipSync(files, { level: 0 })], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "fotografii-anunt.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      toast.error("Fotografiile nu au putut fi descărcate.");
    } finally {
      setZipping(false);
    }
  };

  const uploadVideo = (n: VideoUploadNetwork, res = videoResult) => {
    if (videoUploadStep(n, res) === "generate" || !res) {
      setPendingUpload(n);
      setVideoFormat("vertical");
      setVideoOpen(true);
      toast.info(n === "tiktok" ? "Generează întâi video-ul vertical." : "Generează întâi video-ul de prezentare.");
      return;
    }
    const copy = videoUploadCopy(video?.title ?? "", video?.price ?? null, text, offerLink);
    void navigator.clipboard?.writeText(copy.clipboard).catch(() => undefined);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(res.blob);
    a.download = res.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    window.open(VIDEO_UPLOAD_URL[n], "_blank", "noopener,noreferrer");
    toast.success(`Titlul și descrierea sunt copiate, lipește-le pe ${n === "tiktok" ? "TikTok" : "YouTube"}`);
    logShare(`Distribuit pe ${n === "tiktok" ? "TikTok" : "YouTube"}`);
  };
  const sharePhone = () => void shareFilesFromPhone(photoFiles, `${text}\n\n${offerLink}`, () => logShare("Distribuit din telefon"));
  const fbState = facebookListingState(d.catalog.enabled, d.catalog.reason).label;

  const cards: PromoCard[] = [
    { key: "poster", icon: ImageIcon, tone: "bg-primary/15 text-primary", title: "Poster", badge: "Recomandat",
      text: "Creează un poster pentru feed sau story, gata de postat.", action: "Creează poster",
      onClick: () => { onOpenPoster?.(); logShare("Poster deschis din Promovare"); } },
    { key: "video", icon: Film, tone: "bg-accent text-accent-foreground", title: "Video",
      text: "Creează un video de prezentare, cu muzică și animații.", action: "Creează video",
      onClick: () => { setPendingUpload(null); setVideoOpen(true); }, disabled: !video },
    { key: "facebook", icon: Facebook, tone: "bg-[#1877F2] text-white", title: "Facebook",
      text: "Publică proprietatea pe pagina ta de Facebook.", action: "Postează",
      onClick: () => {
        if (metaQ.data?.pages.length) return setMetaOpen(true);
        if (phoneShare && photoFiles.length) return sharePhone();
        window.open(shareLinks(offerLink, text).facebook, "_blank", "noopener,noreferrer");
        logShare("Distribuit pe Facebook");
      },
      footer: (
        <div className="space-y-1">
        {metaQ.data?.lastPost ? (
          <p className="text-xs text-muted-foreground">
            Postat pe {metaQ.data.lastPost.pageName} · {metaQ.data.lastPost.publishedAt ? formatDateTime(metaQ.data.lastPost.publishedAt) : ""}
            {metaQ.data.lastPost.permalink ? <> · <a href={metaQ.data.lastPost.permalink} target="_blank" rel="noopener noreferrer" className="underline">Vezi postarea</a></> : null}
          </p>
        ) : null}
        {metaQ.data && !metaQ.data.pages.length ? (
          <p className="text-xs text-muted-foreground">{metaQ.data.status === "expired" ? "Conexiunea a expirat. Reconectează pagina din Setări → Promovare" : "Conectează pagina din Setări → Promovare"}</p>
        ) : null}
        <button type="button" onClick={() => onOpenPublishing?.()} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Catalog Facebook: {fbState}
        </button>
        </div>
      ) },
    { key: "instagram", icon: Instagram, tone: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white", title: "Instagram",
      text: "Postează posterul sau video-ul în feed, story sau reels.", action: "Postează",
      onClick: () => (metaQ.data?.instagram.length ? setIgOpen(true) : phoneShare && photoFiles.length ? sharePhone() : setQrOpen(true)),
      footer: (
        <div className="space-y-1">
          {metaQ.data?.lastInstagramPost ? (
            <p className="text-xs text-muted-foreground">
              Postat pe @{metaQ.data.lastInstagramPost.username} · {metaQ.data.lastInstagramPost.publishedAt ? formatDateTime(metaQ.data.lastInstagramPost.publishedAt) : ""}
              {metaQ.data.lastInstagramPost.permalink ? <> · <a href={metaQ.data.lastInstagramPost.permalink} target="_blank" rel="noopener noreferrer" className="underline">Vezi postarea</a></> : null}
            </p>
          ) : null}
          {metaQ.data && !metaQ.data.instagram.length ? <p className="text-xs text-muted-foreground">{IG_NO_ACCOUNT_MESSAGE}</p> : null}
        </div>
      ) },
    { key: "whatsapp", icon: MessageCircle, tone: "bg-[#25D366] text-white", title: "WhatsApp",
      text: "Trimite oferta clienților sau în grupuri.", action: "Trimite",
      onClick: () => { window.open(shareLinks(offerLink, text).whatsapp, "_blank", "noopener,noreferrer"); logShare("Distribuit pe WhatsApp"); } },
    { key: "youtube", icon: Youtube, tone: "bg-[#FF0000] text-white", title: "YouTube",
      text: "Publică video-ul de prezentare pe canalul tău.", action: "Publică pe YouTube",
      onClick: () => (ytQ.data?.status === "connected" ? setYtOpen(true) : uploadVideo("youtube")), disabled: !video,
      footer: (
        <div className="space-y-1">
          {ytQ.data?.lastPost ? (
            <p className="text-xs text-muted-foreground">
              Publicat pe {ytQ.data.lastPost.channelTitle} · {ytQ.data.lastPost.publishedAt ? formatDateTime(ytQ.data.lastPost.publishedAt) : ""}
              {ytQ.data.lastPost.url ? <> · <a href={ytQ.data.lastPost.url} target="_blank" rel="noopener noreferrer" className="underline">Vezi video</a></> : null}
            </p>
          ) : null}
          {ytQ.data?.status === "expired" ? <p className="text-xs text-muted-foreground">Reconectează canalul YouTube din Setări → Promovare</p> : null}
        </div>
      ) },
    { key: "tiktok", icon: Music2, tone: "bg-[#010101] text-white", title: "TikTok",
      text: "Publică video-ul vertical pe contul tău de TikTok.", action: "Publică pe TikTok",
      onClick: () => uploadVideo("tiktok"), disabled: !video },
  ];

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="font-sans text-lg font-bold">Promovează proprietatea pe rețelele sociale</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="promotion-cards">
          {cards.map((c) => (
            <div key={c.key} className="panel flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <span className={cn("grid size-12 place-items-center rounded-xl", c.tone)} aria-hidden="true">
                  <c.icon className="size-6" />
                </span>
                {c.badge ? <span className="rounded-pill bg-gold-tint px-2 py-0.5 text-xs font-semibold text-gold-dark">{c.badge}</span> : null}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{c.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
              </div>
              <Button variant={c.key === "poster" ? "default" : "outline"} onClick={c.onClick} disabled={c.disabled}>{c.action}</Button>
              {c.footer}
            </div>
          ))}
        </div>
      </section>

      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Video de prezentare</DialogTitle>
            <DialogDescription>Se generează în browser; nimic nu se publică automat.</DialogDescription>
          </DialogHeader>
          {video ? (
            <PropertyVideoCard
              key={videoFormat}
              listing={video}
              propertyId={propertyId}
              shareText={text}
              initialFormat={videoFormat}
              onResult={(r) => {
                setVideoResult(r);
                if (pendingUpload && videoUploadStep(pendingUpload, r) === "upload") {
                  toast.success(`Video gata. Apasă din nou „Publică pe ${pendingUpload === "tiktok" ? "TikTok" : "YouTube"}”.`);
                  setPendingUpload(null);
                }
              }}
              photos={d.photos.filter((p) => urls[p.id]).map((p) => ({ id: p.id, url: urls[p.id] as string, alt: p.alt }))}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {metaQ.data?.pages.length ? (
        <MetaPostDialog
          open={metaOpen}
          onOpenChange={setMetaOpen}
          propertyId={propertyId}
          ctx={metaQ.data}
          initialText={text}
          photos={selected.filter((id) => urls[id]).map((id) => ({ id, url: urls[id] as string }))}
          video={videoResult?.blob ?? null}
          musicTrackId={videoResult?.musicTrackId ?? null}
          onCreatePoster={() => { setMetaOpen(false); onOpenPoster?.(); }}
          onCreateVideo={() => { setMetaOpen(false); setPendingUpload(null); setVideoOpen(true); }}
          onPosted={() => void metaQ.refetch()}
        />
      ) : null}

      {metaQ.data?.instagram.length ? (
        <InstagramPostDialog
          open={igOpen}
          onOpenChange={setIgOpen}
          propertyId={propertyId}
          ctx={metaQ.data}
          initialText={text}
          photos={selected.filter((id) => urls[id]).map((id) => ({ id, url: urls[id] as string }))}
          video={videoResult?.blob ?? null}
          musicTrackId={videoResult?.musicTrackId ?? null}
          videoVertical={videoResult?.format === "vertical"}
          onCreatePoster={() => { setIgOpen(false); onOpenPoster?.(); }}
          onCreateVideo={() => { setIgOpen(false); setPendingUpload(null); setVideoFormat("vertical"); setVideoOpen(true); }}
          onPosted={() => void metaQ.refetch()}
        />
      ) : null}

      {ytQ.data?.status === "connected" ? (
        <YoutubePostDialog
          open={ytOpen}
          onOpenChange={setYtOpen}
          propertyId={propertyId}
          ctx={ytQ.data}
          listingTitle={video?.title ?? ""}
          price={video?.price ?? null}
          initialText={text}
          hashtags={hashtags}
          video={videoResult?.blob ?? null}
          musicTrackId={videoResult?.musicTrackId ?? null}
          onCreateVideo={() => { setYtOpen(false); setPendingUpload(null); setVideoOpen(true); }}
          onPosted={() => void ytQ.refetch()}
        />
      ) : null}

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Instagram</DialogTitle>
            <DialogDescription>Scanează cu telefonul ca să postezi pe Instagram</DialogDescription>
          </DialogHeader>
          <div className="mx-auto rounded-xl bg-card p-4">
            {pageUrl ? <QRCodeSVG value={pageUrl} size={220} bgColor="transparent" fgColor="currentColor" className="text-foreground" aria-label="Cod QR pentru această pagină" /> : null}
          </div>
        </DialogContent>
      </Dialog>

      <div className="panel space-y-5 p-5">
        <div>
          <h3 className="font-medium">Postare pe rețele sociale</h3>
          <p className="text-sm text-muted-foreground">
            Textul și pozele se pregătesc aici; le copiezi și le postezi tu. Nimic nu se salvează.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rețea">
          {SOCIAL_NETWORKS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={network === n}
              onClick={() => setNetwork(n)}
              className={cn(
                "rounded-pill border px-3 py-1 text-sm",
                network === n
                  ? "border-primary bg-gold-tint font-semibold text-gold-dark"
                  : "border-border text-muted-foreground",
              )}
            >
              {SOCIAL_NETWORK_LABELS[n]}
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="social-text">Text postare</Label>
                <span className={cn("text-xs", text.length > limit ? "text-destructive" : "text-muted-foreground")}>
                  {text.length} / {limit}
                </span>
              </div>
              <Textarea id="social-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
              {text.length > limit ? (
                <p className="text-xs text-destructive">Textul depășește limita recomandată pentru {SOCIAL_NETWORK_LABELS[network]}.</p>
              ) : null}
              {hashtags.length && network !== "whatsapp" ? (
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.map((h) => (
                    <span key={h} className="rounded-pill border border-border bg-muted px-2 py-0.5 text-xs">{h}</span>
                  ))}
                </div>
              ) : null}
              {showAiRewrite(isEnabled) ? (
                <Button variant="outline" size="sm" onClick={() => ai.mutate()} disabled={ai.isPending}>
                  <Sparkles className="size-4" /> Generează alt text
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">
                Fotografii în postare ({selected.length}/{Math.min(10, d.photos.length)})
              </p>
              {d.photos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Anunțul nu are fotografii publicabile.</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {d.photos.map((p) => {
                    const idx = selected.indexOf(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelected((s) => togglePhotoSelection(s, p.id))}
                        aria-pressed={idx >= 0}
                        className={cn(
                          "relative size-20 shrink-0 overflow-hidden rounded-md border-2",
                          idx >= 0 ? "border-primary" : "border-transparent opacity-70",
                        )}
                      >
                        {urls[p.id] ? <img src={urls[p.id]} alt={p.alt ?? ""} className="size-full object-cover" /> : <span className="block size-full bg-muted" />}
                        {idx >= 0 ? (
                          <span className="absolute left-1 top-1 rounded-pill bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{idx + 1}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={copyText}><Copy className="size-4" /> Copiază textul</Button>
              <Button variant="outline" onClick={downloadZip} disabled={zipping || selected.length === 0}>
                <Download className="size-4" /> Descarcă fotografiile (ZIP)
              </Button>
              {phoneShare ? (
                <Button onClick={() => void shareFilesFromPhone(photoFiles, `${text}\n\n${offerLink}`, () => logShare("Distribuit din telefon"))} disabled={photoFiles.length === 0}>
                  <Share2 className="size-4" /> Distribuie pozele
                </Button>
              ) : null}
            </div>
            {!phoneShare ? (
              <div className="space-y-2" data-testid="desktop-share">
                <div className="flex flex-wrap gap-2">
                  {(["facebook", "whatsapp", "linkedin"] as ShareNetwork[]).map((n) => (
                    <Button key={n} variant="outline" size="sm" onClick={() => {
                      window.open(shareLinks(offerLink, text)[n], "_blank", "noopener,noreferrer");
                      logShare(`Distribuit pe ${SHARE_NETWORK_LABEL[n]}`);
                    }}>
                      <Share2 className="size-4" /> {n === "whatsapp" ? "Trimite pe WhatsApp" : `Distribuie pe ${SHARE_NETWORK_LABEL[n]}`}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Instagram și TikTok: descarcă posterul sau video-ul și postează-l din telefon.</p>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-border" aria-label="Previzualizare postare">
            <p className="px-3 py-2 text-sm font-semibold">{d.agencyName}</p>
            {firstPhoto ? <img src={firstPhoto} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full bg-muted" />}
            <p className="max-h-64 overflow-y-auto whitespace-pre-line px-3 py-2 text-sm">{text}</p>
          </div>
        </div>
      </div>

    </div>
  );
}

type PromoCard = {
  key: string;
  icon: typeof Film;
  tone: string;
  title: string;
  badge?: string;
  text: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
  footer?: ReactNode;
};
