import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { getDynamicFeedRegistry, updateDynamicFeedPortal } from "@/lib/dynamic-feed-portals.functions";

/** Descrierea publică proprie a unui portal din SuperAdmin; goală = text generat automat. */
export function PortalPublicDescriptionEditor({ slug }: { slug: string }) {
  const load = useServerFn(getDynamicFeedRegistry);
  const update = useServerFn(updateDynamicFeedPortal);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["dynamic-feed-registry"], queryFn: () => load() });
  const current = data?.find((p) => p.id === slug)?.public_description ?? "";
  const [text, setText] = useState(current);
  useEffect(() => setText(current), [current]);
  const save = useMutation({
    mutationFn: () => update({ data: { slug, public_description: text.trim() || null } }),
    onSuccess: () => { toast.success("Descrierea publică a fost salvată."); qc.invalidateQueries({ queryKey: ["dynamic-feed-registry"] }); },
    onError: () => toast.error("Descrierea nu a putut fi salvată."),
  });
  return <div className="mt-3 space-y-2">
    <label className="text-sm font-medium" htmlFor={`desc-${slug}`}>Descriere pe pagina publică de integrare</label>
    <Textarea id={`desc-${slug}`} value={text} maxLength={3000} rows={3} onChange={(e) => setText(e.target.value)} placeholder="Gol: se folosește textul generat din datele portalului." />
    <Button size="sm" variant="outline" disabled={save.isPending || text.trim() === current.trim()} onClick={() => save.mutate()}>Salvează descrierea</Button>
  </div>;
}
