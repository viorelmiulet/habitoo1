/**
 * Studio AI — generare de media cu Replicate.
 *
 * Interfața nu atinge providerul: încărcarea fotografiei merge în stocarea
 * agenției, iar generarea și copierea rezultatului se fac prin server functions.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ImagePlus, Loader2, Sparkles, Trash2, Upload, Video, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import {
  AI_MEDIA_BUCKET,
  deleteAiMedia,
  getAiMediaStatus,
  listAiMedia,
  refreshAiMedia,
  startAiMedia,
  type AiMediaItem,
} from "@/lib/ai/media/media.functions";

type Kind = AiMediaItem["kind"];

const KINDS: {
  kind: Kind;
  label: string;
  icon: typeof Wand2;
  needsPhoto: boolean;
  hint: string;
  placeholder: string;
}[] = [
  {
    kind: "photo_enhance",
    label: "Îmbunătățire poză",
    icon: Wand2,
    needsPhoto: true,
    hint: "Încarcă o fotografie a proprietății. Lasă instrucțiunea goală pentru o curățare naturală a luminii și a culorilor.",
    placeholder: "ex. lumină naturală mai clară, fără să modifici camera",
  },
  {
    kind: "photo_video",
    label: "Video de prezentare",
    icon: Video,
    needsPhoto: true,
    hint: "Dintr-o fotografie se creează un scurt video de prezentare. Durează de obicei 1–3 minute.",
    placeholder: "ex. mișcare lentă de cameră prin living",
  },
  {
    kind: "marketing_image",
    label: "Imagine marketing",
    icon: ImagePlus,
    needsPhoto: false,
    hint: "Descrie imaginea de care ai nevoie pentru postări sau materiale. Nu folosi această imagine ca fotografie a proprietății.",
    placeholder: "ex. banner curat cu text „Casă nouă în Pipera”, tonuri calde",
  },
];

const STATUS: Record<
  AiMediaItem["status"],
  { label: string; state: "pending" | "published" | "error" }
> = {
  running: { label: "În lucru", state: "pending" },
  succeeded: { label: "Gata", state: "published" },
  failed: { label: "Eșuat", state: "error" },
};

const KIND_LABEL: Record<Kind, string> = {
  photo_enhance: "Îmbunătățire poză",
  photo_video: "Video de prezentare",
  marketing_image: "Imagine marketing",
};

export function AiMediaPanel() {
  const { data: session } = useCurrentUser();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>("photo_enhance");
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const status = useQuery({ queryKey: ["ai-media-status"], queryFn: () => getAiMediaStatus() });
  const history = useQuery({ queryKey: ["ai-media"], queryFn: () => listAiMedia() });
  const items = history.data?.items ?? [];
  const running = useMemo(() => items.filter((i) => i.status === "running"), [items]);

  // Generările în lucru se verifică periodic până se încheie.
  useEffect(() => {
    if (running.length === 0) return;
    const timer = setInterval(() => {
      void Promise.all(running.map((item) => refreshAiMedia({ data: { id: item.id } }))).then(() =>
        queryClient.invalidateQueries({ queryKey: ["ai-media"] }),
      );
    }, 6000);
    return () => clearInterval(timer);
  }, [running, queryClient]);

  const active = KINDS.find((k) => k.kind === kind)!;

  const generate = useMutation({
    mutationFn: async () => {
      let sourcePath: string | null = null;
      if (active.needsPhoto) {
        if (!file) throw new Error("Încarcă o fotografie înainte de a genera.");
        const orgId = session?.organization?.id;
        const userId = session?.userId;
        if (!orgId || !userId) throw new Error("Contul tău nu este legat de o agenție.");
        setUploading(true);
        const path = `${orgId}/${userId}/source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { error } = await supabase.storage
          .from(AI_MEDIA_BUCKET)
          .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
        setUploading(false);
        if (error) throw new Error(error.message);
        sourcePath = path;
      }
      return startAiMedia({ data: { kind, prompt, sourcePath } });
    },
    onSuccess: (result) => {
      setUploading(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Generarea a pornit. Rezultatul apare aici când este gata.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["ai-media"] });
    },
    onError: (error: Error) => {
      setUploading(false);
      toast.error(error.message);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAiMedia({ data: { id } }),
    onSuccess: () => {
      toast.success("Șters.");
      void queryClient.invalidateQueries({ queryKey: ["ai-media"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = generate.isPending || uploading;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Generare nouă
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.data && !status.data.configured ? (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              Contul de generare nu este conectat încă. Roagă administratorul platformei să îl
              conecteze.
            </p>
          ) : null}

          <Tabs value={kind} onValueChange={(value) => setKind(value as Kind)}>
            <TabsList className="grid w-full grid-cols-3">
              {KINDS.map((option) => (
                <TabsTrigger key={option.kind} value={option.kind} className="min-h-11 text-xs">
                  <option.icon className="mr-1.5 size-4" />
                  <span className="hidden sm:inline">{option.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {KINDS.map((option) => (
              <TabsContent key={option.kind} value={option.kind} className="pt-3">
                <p className="text-sm text-muted-foreground">{option.hint}</p>
              </TabsContent>
            ))}
          </Tabs>

          {active.needsPhoto ? (
            <div className="space-y-2">
              <Label htmlFor="ai-media-file">Fotografie</Label>
              <input
                id="ai-media-file"
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="mr-2 size-4" />
                {file ? file.name : "Alege o fotografie"}
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="ai-media-prompt">
              {active.kind === "marketing_image" ? "Ce imagine vrei" : "Instrucțiune (opțional)"}
            </Label>
            <Textarea
              id="ai-media-prompt"
              value={prompt}
              rows={3}
              placeholder={active.placeholder}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>

          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={busy || status.data?.configured === false}
            onClick={() => generate.mutate()}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
            Generează
          </Button>
          <p className="text-xs text-muted-foreground">
            Rezultatele rămân în agenția ta. Nimic nu se publică automat.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rezultate</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <p className="text-sm text-muted-foreground">Se încarcă…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Sparkles className="size-8 text-muted-foreground" />
              <p className="text-sm font-semibold">Niciun rezultat încă</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Alege ce vrei să generezi în stânga, iar rezultatele apar aici.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {items.map((item) => (
                <li key={item.id} className="space-y-2 rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{KIND_LABEL[item.kind]}</span>
                    <StatusPill state={STATUS[item.status].state}>
                      {STATUS[item.status].label}
                    </StatusPill>
                  </div>
                  <div className="overflow-hidden rounded-lg bg-muted">
                    {item.status === "succeeded" && item.outputUrl ? (
                      item.kind === "photo_video" ? (
                        <video src={item.outputUrl} controls className="aspect-video w-full" />
                      ) : (
                        <img
                          src={item.outputUrl}
                          alt={item.prompt || KIND_LABEL[item.kind]}
                          className="aspect-square w-full object-cover"
                        />
                      )
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center text-sm text-muted-foreground">
                        {item.status === "running" ? (
                          <Loader2 className="size-5 animate-spin" />
                        ) : (
                          (item.error ?? "Fără rezultat")
                        )}
                      </div>
                    )}
                  </div>
                  {item.prompt ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{item.prompt}</p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    {item.outputUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={item.outputUrl} download target="_blank" rel="noreferrer">
                          <Download className="mr-1.5 size-4" /> Descarcă
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(item.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="mr-1.5 size-4" /> Șterge
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
