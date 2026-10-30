/** Poza principală a proprietății, pentru coloana din stânga a formularului de editare. */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET, signedUrls } from "@/lib/storage";

type Row = { url: string | null; storage_path: string | null; position: number | null; is_primary: boolean | null };

export function PropertyMainPhoto({ propertyId, title }: { propertyId: string; title: string | null }) {
  const { data: main } = useQuery({
    queryKey: ["property-main-photo", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_images")
        .select("url,storage_path,position,is_primary")
        .eq("property_id", propertyId)
        .order("position", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      return rows.find((r) => r.is_primary) ?? rows[0] ?? null;
    },
  });
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!main) { setSrc(null); return; }
    if (!main.storage_path) { setSrc(main.url); return; }
    const path = main.storage_path;
    signedUrls(MEDIA_BUCKET, [path]).then((map) => { if (active) setSrc(map[path] ?? main.url); });
    return () => { active = false; };
  }, [main]);
  return src
    ? <img src={src} alt={title ?? "Poza principală"} className="aspect-[4/3] w-full rounded-[4px] border border-border object-cover" />
    : <div className="grid aspect-[4/3] w-full place-items-center rounded-[4px] border border-border bg-muted text-sm text-muted-foreground">Fără poză</div>;
}
