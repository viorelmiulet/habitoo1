import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mediaLinkError, normalizeMediaLink } from "@/lib/property-media/links";

/** Linkurile video și tur virtual ale proprietății (sub galerie, în tabul Fotografii). */
export function PropertyMediaLinks({ propertyId, userId }: { propertyId: string; userId: string | undefined }) {
  const qc = useQueryClient();
  const queryKey = ["property-media-links", propertyId] as const;
  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("video_url,virtual_tour_url").eq("id", propertyId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [video, setVideo] = useState("");
  const [tour, setTour] = useState("");
  const [errors, setErrors] = useState<{ video?: string; tour?: string }>({});
  useEffect(() => {
    setVideo(data?.video_url ?? "");
    setTour(data?.virtual_tour_url ?? "");
  }, [data?.video_url, data?.virtual_tour_url]);

  const save = useMutation({
    mutationFn: async () => {
      const v = normalizeMediaLink(video);
      const t = normalizeMediaLink(tour);
      const next = {
        video: v ? (mediaLinkError(v, "video") ?? undefined) : undefined,
        tour: t ? (mediaLinkError(t, "virtual_tour") ?? undefined) : undefined,
      };
      setErrors(next);
      if (next.video || next.tour) throw new Error(next.video ?? next.tour);
      const { error } = await supabase
        .from("properties")
        .update({ video_url: v, virtual_tour_url: t, updated_by: userId ?? null } as never)
        .eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Linkurile au fost salvate."); qc.invalidateQueries({ queryKey }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="panel mt-4 space-y-3 px-5 py-[18px]">
      <h2 className="font-sans text-base font-bold">Video și tur virtual</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="video_url">Link video (YouTube / Vimeo)</Label>
          <Input id="video_url" type="url" inputMode="url" maxLength={500} placeholder="https://www.youtube.com/watch?v=…" value={video} onChange={(e) => setVideo(e.target.value)} aria-invalid={Boolean(errors.video)} />
          {errors.video ? <p className="text-xs text-destructive">{errors.video}</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="virtual_tour_url">Tur virtual (Matterport, Kuula, Cupix, YouTube, Vimeo)</Label>
          <Input id="virtual_tour_url" type="url" inputMode="url" maxLength={500} placeholder="https://my.matterport.com/show/?m=…" value={tour} onChange={(e) => setTour(e.target.value)} aria-invalid={Boolean(errors.tour)} />
          {errors.tour ? <p className="text-xs text-destructive">{errors.tour}</p> : null}
        </div>
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Salvează linkurile</Button>
    </section>
  );
}
