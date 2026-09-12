/**
 * Galeria din capul paginii de proprietate: o fotografie mare plus două
 * miniaturi, iar pe ultima miniatură contorul „+N foto”.
 *
 * Doar prezentare: refolosește imaginile existente din `property_images`
 * (ordinea reală: is_primary → position) și nu modifică nimic.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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
}: {
  propertyId: string;
  title: string;
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
  const thumbs = rest.slice(0, 2);
  const hidden = Math.max(0, images.length - 1 - thumbs.length);

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-3 sm:col-span-2">
        {main && srcOf(main) ? (
          <img
            src={srcOf(main) as string}
            alt={main.alt ?? title}
            loading="lazy"
            decoding="async"
            className="h-56 w-full rounded-2xl object-cover sm:h-72"
          />
        ) : (
          <Placeholder className="h-56 w-full sm:h-72" />
        )}
      </div>

      <div className="col-span-3 grid grid-cols-2 gap-3 sm:col-span-1 sm:grid-cols-1">
        {[0, 1].map((slot) => {
          const img = thumbs[slot];
          const src = img ? srcOf(img) : null;
          const isLast = slot === 1;
          return (
            <div key={slot} className="relative">
              {img && src ? (
                <img
                  src={src}
                  alt={img.alt ?? title}
                  loading="lazy"
                  decoding="async"
                  className="h-[6.5rem] w-full rounded-2xl object-cover sm:h-[8.5rem]"
                />
              ) : (
                <Placeholder className="h-[6.5rem] w-full sm:h-[8.5rem]" />
              )}
              {isLast && hidden > 0 ? (
                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-foreground/55 text-sm font-medium text-background">
                  +{hidden} foto
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
