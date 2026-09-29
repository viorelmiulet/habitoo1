/**
 * Galeria din capul paginii de proprietate: o fotografie mare plus două
 * miniaturi, iar pe ultima miniatură contorul „+N foto”.
 *
 * Doar prezentare: refolosește imaginile existente din `property_images`
 * (ordinea reală: is_primary → position) și nu modifică nimic.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Image, ImageOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MEDIA_BUCKET, signedUrls } from "@/lib/storage";
import { cn } from "@/lib/utils";


type ImageRow = {
  url: string;
  storage_path: string | null;
  position: number;
  is_primary: boolean;
  is_confidential: boolean;
  alt: string | null;
};

function sortImages(rows: ImageRow[]) {
  return [...rows].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    if (a.is_confidential !== b.is_confidential) return a.is_confidential ? 1 : -1;
    return a.position - b.position;
  });
}

function Placeholder({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-2xl bg-muted text-muted-foreground",
        className,
      )}
    >
      <ImageOff className="size-4" aria-hidden />
      <span className="text-[10px] font-medium tracking-wide uppercase">Fără foto</span>
    </span>
  );
}

export function PropertyHeroGallery({
  propertyId,
  title,
  onAddPhotos,
}: {
  propertyId: string;
  title: string;
  onAddPhotos?: () => void;
}) {
  const [signed, setSigned] = useState<Record<string, string>>({});

  const { data: images = [] } = useQuery({
    queryKey: ["property-hero-images", propertyId],
    enabled: Boolean(propertyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_images")
        .select("url,storage_path,position,is_primary,is_confidential,alt")
        .eq("property_id", propertyId)
        .order("position", { ascending: true });
      if (error) throw error;
      return sortImages((data ?? []) as ImageRow[]);
    },
  });

  const pathsKey = images
    .map((i) => i.storage_path)
    .filter((v): v is string => Boolean(v))
    .join("|");

  useEffect(() => {
    if (!pathsKey) return;
    let active = true;
    signedUrls(MEDIA_BUCKET, pathsKey.split("|")).then((map) => {
      if (active) setSigned(map);
    });
    return () => {
      active = false;
    };
  }, [pathsKey]);

  const srcOf = (img: ImageRow) =>
    (img.storage_path ? signed[img.storage_path] : null) ?? img.url ?? null;

  const [main, ...rest] = images;
  const thumbs = rest.slice(0, 4);
  const hidden = Math.max(0, images.length - 1 - thumbs.length);

  // Vizualizator pe ecran complet: click pe orice poză, navigare cu butoane sau taste.
  const [openAt, setOpenAt] = useState<number | null>(null);
  const total = images.length;
  const step = useCallback(
    (delta: number) => setOpenAt((prev) => (prev === null ? prev : (prev + delta + total) % total)),
    [total],
  );

  useEffect(() => {
    if (openAt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAt, step]);

  const active = openAt === null ? null : images[openAt];
  const activeSrc = active ? srcOf(active) : null;

  if (!main || !srcOf(main)) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-panel border border-border bg-muted text-center">
        <ImageOff className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold">Nicio poză încă</p>
        {onAddPhotos ? (
          <Button type="button" variant="outline" onClick={onAddPhotos}>
            <Image aria-hidden /> Adaugă poze
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpenAt(0)}
            className="block h-auto w-full overflow-hidden rounded-panel p-0"
            aria-label="Deschide galeria foto"
          >
            <img
              src={srcOf(main) as string}
              alt={main.alt ?? title}
              loading="eager"
              decoding="async"
              className="h-[300px] w-full cursor-zoom-in object-cover transition hover:opacity-95 xl:h-[360px]"
            />
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="absolute right-4 bottom-4"
            onClick={() => setOpenAt(0)}
          >
            <Image aria-hidden /> Vezi toate cele {total} {total === 1 ? "poză" : "poze"}
          </Button>
      </div>

      {rest.length > 0 ? (
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((slot) => {
          const img = thumbs[slot];
          const src = img ? srcOf(img) : null;
          const isLast = slot === 3;
          return (
            <div key={slot} className="relative">
              {img && src ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpenAt(slot + 1)}
                  className="block h-auto w-full p-0"
                  aria-label={`Deschide fotografia ${slot + 2}`}
                >
                  <img
                    src={src}
                    alt={img.alt ?? title}
                    loading="lazy"
                    decoding="async"
                    className="h-24 w-full cursor-zoom-in rounded-xl object-cover transition hover:opacity-95"
                  />
                </Button>
              ) : (
                <Placeholder className="h-24 w-full rounded-xl" />
              )}
              {isLast && hidden > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpenAt(slot + 1)}
                  aria-label={`Vezi încă ${hidden} fotografii`}
                  className="absolute inset-0 flex h-full items-center justify-center rounded-xl bg-foreground/70 text-lg font-semibold text-background hover:bg-foreground/80 hover:text-background"
                >
                  +{hidden}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      ) : null}

      <Dialog open={openAt !== null} onOpenChange={(open) => !open && setOpenAt(null)}>
        <DialogContent className="max-w-5xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div className="relative">
            {activeSrc ? (
              <img
                src={activeSrc}
                alt={active?.alt ?? title}
                className="max-h-[80vh] w-full rounded-2xl bg-background object-contain"
              />
            ) : (
              <Placeholder className="h-72 w-full" />
            )}
            {total > 1 ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => step(-1)}
                  aria-label="Fotografia anterioară"
                  className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-background/85 text-foreground hover:bg-background"
                >
                  <ChevronLeft className="size-5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => step(1)}
                  aria-label="Fotografia următoare"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-background/85 text-foreground hover:bg-background"
                >
                  <ChevronRight className="size-5" aria-hidden />
                </Button>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground/70 px-3 py-1 text-xs font-medium text-background">
                  {(openAt ?? 0) + 1} / {total}
                </span>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

}
