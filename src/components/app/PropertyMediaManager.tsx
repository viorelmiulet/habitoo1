import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  EyeOff,
  ImageOff,
  Images,
  RotateCw,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  MEDIA_BUCKET,
  compressImage,
  mediaPath,
  removeFromBucket,
  rotateImageBlob,
  signedUrls,
  uploadToBucket,
} from "@/lib/storage";

type ImageRow = {
  id: string;
  url: string;
  storage_path: string | null;
  position: number;
  is_primary: boolean;
  include_in_publish: boolean;
  is_confidential: boolean;
  width: number | null;
  height: number | null;
};

export function PropertyMediaManager({
  propertyId,
  orgId,
  userId,
}: {
  propertyId: string;
  orgId: string | null | undefined;
  userId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [cacheBust, setCacheBust] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);

  const queryKey = ["property-images", propertyId] as const;

  const { data: images = [], isLoading } = useQuery({
    queryKey,
    enabled: Boolean(propertyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_images")
        .select("id,url,storage_path,position,is_primary,include_in_publish,is_confidential,width,height")
        .eq("property_id", propertyId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as ImageRow[];
    },
  });

  useEffect(() => {
    const paths = images.map((i) => i.storage_path).filter((p): p is string => Boolean(p));
    if (paths.length === 0) return;
    signedUrls(MEDIA_BUCKET, paths).then(setSigned);
  }, [images]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      if (!orgId) throw new Error("Agenția nu este configurată.");
      let position = images.length;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const { blob, width, height } = await compressImage(file);
        const path = mediaPath(orgId, propertyId, file.name);
        await uploadToBucket(MEDIA_BUCKET, path, blob, "image/jpeg");
        const { error } = await supabase.from("property_images").insert({
          organization_id: orgId,
          property_id: propertyId,
          url: path,
          storage_path: path,
          position,
          width,
          height,
          is_primary: images.length === 0 && position === images.length,
          created_by: userId ?? null,
        } as never);
        if (error) throw error;
        position += 1;
      }
    },
    onSuccess: () => {
      toast.success("Imagini încărcate.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setUploading(false),
  });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("property_images")
        .update({ ...values, updated_by: userId ?? null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const setPrimary = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("property_images").update({ is_primary: false } as never).eq("property_id", propertyId);
      const { error } = await supabase.from("property_images").update({ is_primary: true } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Imagine principală actualizată.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeImage = useMutation({
    mutationFn: async (img: ImageRow) => {
      if (img.storage_path) await removeFromBucket(MEDIA_BUCKET, [img.storage_path]);
      const { error } = await supabase.from("property_images").delete().eq("id", img.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Imagine ștearsă.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotate = useMutation({
    mutationFn: async (img: ImageRow) => {
      const src = img.storage_path ? signed[img.storage_path] : null;
      if (!src || !img.storage_path) throw new Error("Imaginea nu poate fi rotită momentan.");
      const blob = await rotateImageBlob(src);
      if (!blob) throw new Error("Rotirea a eșuat.");
      await uploadToBucket(MEDIA_BUCKET, img.storage_path, blob, "image/jpeg");
      setCacheBust((c) => ({ ...c, [img.id]: Date.now() }));
    },
    onSuccess: () => {
      toast.success("Imagine rotită.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: async (ordered: ImageRow[]) => {
      await Promise.all(
        ordered.map((img, idx) =>
          supabase.from("property_images").update({ position: idx } as never).eq("id", img.id),
        ),
      );
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    upload.mutate(files);
  };

  const onDropReorder = (index: number) => {
    if (dragIndex.current === null || dragIndex.current === index) return;
    const next = [...images];
    const [moved] = next.splice(dragIndex.current, 1);
    next.splice(index, 0, moved);
    dragIndex.current = null;
    reorder.mutate(next);
  };

  const imgUrl = (img: ImageRow) => {
    const base = img.storage_path ? signed[img.storage_path] : null;
    if (!base) return null;
    const bust = cacheBust[img.id];
    return bust ? `${base}${base.includes("?") ? "&" : "?"}v=${bust}` : base;
  };

  return (
    <div className="space-y-4">
      <div
        className={`panel flex flex-col items-center justify-center gap-2 border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <Images className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Trage imaginile aici sau</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <Upload className="size-4" /> {uploading ? "Se încarcă…" : "Alege fișiere"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground">Se încarcă imaginile…</p>
      ) : images.length === 0 ? (
        <EmptyState icon={ImageOff} title="Nicio imagine încărcată" description="Adaugă poze pentru acest anunț." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, idx) => {
            const url = imgUrl(img);
            return (
              <div
                key={img.id}
                draggable
                onDragStart={() => (dragIndex.current = idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropReorder(idx)}
                className="panel group relative overflow-hidden p-0"
              >
                <button
                  type="button"
                  className="block aspect-square w-full bg-muted"
                  onClick={() => setPreview(idx)}
                >
                  {url ? (
                    <img src={url} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageOff className="size-6" />
                    </div>
                  )}
                </button>
                {img.is_primary ? (
                  <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Principală
                  </span>
                ) : null}
                {img.is_confidential ? (
                  <span className="absolute top-2 right-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <EyeOff className="size-3" />
                  </span>
                ) : null}
                <div className="flex flex-wrap items-center gap-1 border-t border-border p-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Setează principală"
                    onClick={() => setPrimary.mutate(img.id)}
                  >
                    <Star className={`size-3.5 ${img.is_primary ? "fill-primary text-primary" : ""}`} />
                  </Button>
                  <Button size="sm" variant="ghost" title="Rotește" onClick={() => rotate.mutate(img)}>
                    <RotateCw className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Ascunde/arată"
                    onClick={() =>
                      patch.mutate({ id: img.id, values: { is_confidential: !img.is_confidential } })
                    }
                  >
                    <EyeOff className={`size-3.5 ${img.is_confidential ? "text-primary" : ""}`} />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" title="Șterge">
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Ștergi imaginea?</AlertDialogTitle>
                        <AlertDialogDescription>Această acțiune nu poate fi anulată.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Anulează</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeImage.mutate(img)}>Șterge</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
                  <span>Publică</span>
                  <Switch
                    checked={img.include_in_publish}
                    onCheckedChange={(c) => patch.mutate({ id: img.id, values: { include_in_publish: c } })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          {preview !== null ? (
            <div className="relative">
              <img
                src={imgUrl(images[preview]) ?? ""}
                alt=""
                className="mx-auto max-h-[80vh] rounded-xl object-contain"
              />
              <Button
                size="icon"
                variant="secondary"
                className="absolute top-2 right-2"
                onClick={() => setPreview(null)}
              >
                <X className="size-4" />
              </Button>
              {images.length > 1 ? (
                <>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute top-1/2 left-2 -translate-y-1/2"
                    onClick={() => setPreview((p) => (p === null ? p : (p - 1 + images.length) % images.length))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute top-1/2 right-2 -translate-y-1/2"
                    onClick={() => setPreview((p) => (p === null ? p : (p + 1) % images.length))}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
