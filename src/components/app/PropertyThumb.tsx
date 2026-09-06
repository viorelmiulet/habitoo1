/**
 * Miniatura proprietății pentru listări.
 *
 * Reutilizează mecanismul existent de imagine principală din Habitoo:
 * `property_images.is_primary` (cover marcat manual din managerul media),
 * iar în lipsa lui prima imagine după `position`. Nu schimbă ordinea reală
 * a fotografiilor și nu atinge regulile de publicare (`include_in_publish`)
 * — acelea privesc feedul public, nu lista internă.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ImageOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET, signedUrls } from "@/lib/storage";

type CoverRow = {
  property_id: string;
  url: string;
  storage_path: string | null;
  position: number;
  is_primary: boolean;
  is_confidential: boolean;
  alt: string | null;
};

export type PropertyCover = { src: string | null; alt: string | null };

/** Alege coverul unei proprietăți: is_primary → prima după position. */
function pickCover(images: CoverRow[]): CoverRow | null {
  const sorted = [...images].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    // Fotografiile confidențiale rămân vizibile intern, dar nu devin cover
    // dacă există o alternativă neconfidențială.
    if (a.is_confidential !== b.is_confidential) return a.is_confidential ? 1 : -1;
    return a.position - b.position;
  });
  return sorted[0] ?? null;
}

/**
 * Încarcă coverul pentru un set de proprietăți (o singură cerere pe pagină).
 * RLS se aplică normal: se întorc doar imaginile agenției curente.
 */
export function usePropertyCovers(propertyIds: string[]) {
  const ids = [...propertyIds].sort();
  const key = ids.join(",");
  const [signed, setSigned] = useState<Record<string, string>>({});

  const { data: covers = {} } = useQuery({
    queryKey: ["property-covers", key],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_images")
        .select("property_id,url,storage_path,position,is_primary,is_confidential,alt")
        .in("property_id", ids)
        .order("position", { ascending: true });
      if (error) throw error;

      const grouped = new Map<string, CoverRow[]>();
      for (const row of (data ?? []) as CoverRow[]) {
        const list = grouped.get(row.property_id) ?? [];
        list.push(row);
        grouped.set(row.property_id, list);
      }
      const result: Record<string, CoverRow> = {};
      grouped.forEach((list, propertyId) => {
        const cover = pickCover(list);
        if (cover) result[propertyId] = cover;
      });
      return result;
    },
  });

  // Cheie stabilă: efectul rulează doar când se schimbă efectiv căile.
  const paths = Object.values(covers)
    .map((c) => c.storage_path)
    .filter((v): v is string => Boolean(v))
    .sort();
  const pathsKey = paths.join("|");

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

  return (propertyId: string): PropertyCover => {
    const cover = covers[propertyId];
    if (!cover) return { src: null, alt: null };
    const src = cover.storage_path
      ? (signed[cover.storage_path] ?? null)
      : /^https?:\/\//.test(cover.url)
        ? cover.url
        : null;
    return { src, alt: cover.alt };
  };
}

/** Miniatura clickabilă care duce la pagina proprietății. */
export function PropertyThumb({
  propertyId,
  title,
  cover,
  className = "",
}: {
  propertyId: string;
  title: string;
  cover: PropertyCover;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(cover.src) && !failed;

  return (
    <Link
      to="/app/properties/$id"
      params={{ id: propertyId }}
      aria-label={`Deschide ${title}`}
      className={`group relative block shrink-0 overflow-hidden rounded-lg border border-border bg-muted transition-colors hover:border-primary/40 ${className}`}
    >
      {showImage ? (
        <img
          src={cover.src as string}
          alt={cover.alt ?? title}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover transition-opacity group-hover:opacity-90"
        />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
          <ImageOff className="size-4" aria-hidden />
          <span className="text-[10px] font-medium tracking-wide uppercase">Fără foto</span>
        </span>
      )}
    </Link>
  );
}
