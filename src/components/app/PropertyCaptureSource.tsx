import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** „Sursă: <site>” — doar în CRM; nu intră în feeduri, portaluri, PDF, site-ul agenției sau Partner API. */
export function PropertyCaptureSource({ propertyId }: { propertyId: string }) {
  const q = useQuery({
    queryKey: ["property-capture-source", propertyId],
    queryFn: async () => {
      const { data } = await supabase.from("property_capture_sources").select("site,source_url").eq("property_id", propertyId).maybeSingle();
      return data;
    },
  });
  if (!q.data) return null;
  const safe = /^https?:\/\//i.test(q.data.source_url) ? q.data.source_url : null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Sursă:{" "}
      {safe ? (
        <a href={safe} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline">
          {q.data.site} <ExternalLink className="h-3 w-3" />
        </a>
      ) : q.data.site}
    </p>
  );
}
