import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const LABELS: Record<string, string> = { queued: "În coadă", sending: "Se trimite", pending: "În așteptarea Storia", published: "Publicat", withdrawn: "Retras", error: "Eroare" };
export const cloneStatusLabel = (status: string) => LABELS[status] ?? status;

/** Storia: rândul anunțului de agenție și, separat, rândul clonei din contul de dezvoltator. */
export function StoriaCloneRows({ propertyId, agencyStatus, agencyUrl }: { propertyId: string; agencyStatus: string; agencyUrl: string | null }) {
  const { data: clones = [] } = useQuery({
    queryKey: ["storia-development-clones", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("storia_development_units").select("id,transaction_kind,status,public_url,last_error").eq("property_id", propertyId);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!clones.length) return null;
  const link = (url: string | null) => url?.startsWith("https://") ? <a href={url} target="_blank" rel="noreferrer" className="ml-1 text-primary underline">Vezi anunțul</a> : null;
  return (
    <ul className="mt-2 space-y-1 text-xs" data-testid="storia-clone-rows">
      <li><span className="font-medium">Cont agenție:</span> {agencyStatus}{link(agencyUrl)}</li>
      {clones.map((c) => (
        <li key={c.id}>
          <span className="font-medium">Ansamblu (cont dezvoltator):</span> {cloneStatusLabel(c.status)}{clones.length > 1 ? ` · ${c.transaction_kind === "sale" ? "Vânzare" : "Închiriere"}` : ""}{link(c.public_url)}
          {c.last_error ? <span className="block text-destructive">{c.last_error}</span> : null}
        </li>
      ))}
    </ul>
  );
}
