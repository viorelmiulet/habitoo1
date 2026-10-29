import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { getZupNomenclatureStatus, syncZupNomenclature } from "@/lib/portals/zup/nomenclature.functions";
import { formatDateTime } from "@/lib/format";
export function ZupNomenclaturePanel({organizationId}:{organizationId:string}) {
  const cache = useQueryClient(); const load = useServerFn(getZupNomenclatureStatus); const run = useServerFn(syncZupNomenclature);
  const status = useQuery({queryKey:["zup-nomenclature"],queryFn:() => load()});
  const sync = useMutation({mutationFn:() => run({data:{organizationId}}),onSuccess:() => {void cache.invalidateQueries({queryKey:["zup-nomenclature"]});void cache.invalidateQueries({queryKey:["property-portal-requirements"]});}});
  const data = status.data; const counts = data?.counts as Record<string,number>|undefined;
  const changes = data?.changes as Record<string,{added:string[];removed:string[];modified:string[]}>|undefined;
  return <div className="space-y-2 border-t border-border pt-3">
    <Button type="button" size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}><RefreshCw className={sync.isPending ? "size-4 animate-spin" : "size-4"}/>Sincronizează nomenclatorul</Button>
    {data ? <p className="text-xs text-muted-foreground">{formatDateTime(data.created_at)} · {data.success ? `${counts?.categories ?? 0} categorii (${counts?.finalCategories ?? 0} finale), ${counts?.characteristics ?? 0} caracteristici, ${counts?.counties ?? 0} județe, ${counts?.localities ?? 0} localități` : data.error_message}</p> : <p className="text-xs text-muted-foreground">Nomenclator nesincronizat</p>}
    {changes ? Object.entries(changes).map(([key,d]) => <p key={key} className="text-xs text-muted-foreground">{key === "categories" ? "Categorii și caracteristici" : "Localități"}: {d.added.length} adăugate · {d.modified.length} modificate · {d.removed.length} eliminate</p>) : null}
    {sync.error || status.error ? <p role="alert" className="text-sm text-destructive">{sync.error?.message ?? status.error?.message}</p> : null}
  </div>;
}