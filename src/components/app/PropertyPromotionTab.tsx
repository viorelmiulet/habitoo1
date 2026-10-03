import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, Sparkles } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { useCurrentUser } from "@/hooks/use-session";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { getPropertyPromotion } from "@/lib/property-promotion.functions";
import { generateMarketing } from "@/lib/ai/agents/marketing/marketing.functions";
import { MEDIA_BUCKET, signedUrls } from "@/lib/storage";
import { cn } from "@/lib/utils";
import {
  CATALOG_ROW_REASON_LABEL,
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

export function PropertyPromotionTab({ propertyId }: { propertyId: string }) {
  const load = useServerFn(getPropertyPromotion);
  const runAi = useServerFn(generateMarketing);
  const { data: user } = useCurrentUser();
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

  return (
    <div className="space-y-6">
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
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border" aria-label="Previzualizare postare">
            <p className="px-3 py-2 text-sm font-semibold">{d.agencyName}</p>
            {firstPhoto ? <img src={firstPhoto} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full bg-muted" />}
            <p className="max-h-64 overflow-y-auto whitespace-pre-line px-3 py-2 text-sm">{text}</p>
          </div>
        </div>
      </div>

      <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="font-medium">Catalog Facebook</h3>
          <p className="text-sm">
            În catalogul Facebook: <strong>{d.catalog.included ? "Da" : "Nu"}</strong>
            {!d.catalog.included && d.catalog.reason ? ` (${CATALOG_ROW_REASON_LABEL[d.catalog.reason]})` : ""}
          </p>
        </div>
        {user?.isAdmin ? (
          <Link to="/app/settings" search={{ tab: "promotion" }} className="text-sm underline">
            Vezi setările catalogului
          </Link>
        ) : null}
      </div>
    </div>
  );
}
