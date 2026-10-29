import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { formatDateTime } from "@/lib/format";
import { toastError } from "@/lib/errors";
import { getOferaNomenclatureStatus, syncOferaNomenclature } from "@/lib/portals/ofera/nomenclature.functions";
export function OferaNomenclaturePanel() {
  const qc = useQueryClient();
  const get = useServerFn(getOferaNomenclatureStatus);
  const run = useServerFn(syncOferaNomenclature);
  const status = useQuery({ queryKey: ["ofera-nomenclature"], queryFn: () => get() });
  const sync = useMutation({ mutationFn: () => run(), onSuccess: (r) => {
    qc.invalidateQueries({ queryKey: ["ofera-nomenclature"] });
    if (r.ok) toast.success("Nomenclatorul Ofera a fost actualizat."); else toast.error(r.message ?? "Actualizarea Ofera nu a reușit.");
  }, onError: (error: Error) => toastError(error) });
  const data = status.data;
  const changes = data?.changes;
  return <div className="w-full space-y-2">
    <Button type="button" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
      <RefreshCw className={sync.isPending ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
      Actualizează nomenclatorul Ofera
    </Button>
    <p className="text-xs text-muted-foreground">{data?.syncedAt ? `Ultima sincronizare: ${formatDateTime(data.syncedAt)} · ${data.active.categories} categorii, ${data.active.cities} localități, ${data.active.zones} zone` : "Nomenclatorul Ofera nu a fost sincronizat încă."}</p>
    {data?.error || status.error ? <p role="alert" className="text-xs text-destructive">{data?.error ?? "Starea nomenclatorului nu a putut fi încărcată."}</p> : null}
    {data?.counts ? <ul className="space-y-1 text-xs text-muted-foreground">{([['categories','Categorii'],['counties','Județe'],['cities','Localități'],['zones','Zone']] as const).map(([key,label]) => {
      const c = data.counts?.[key];
      return c ? <li key={key}>{label}: {c.read} citite · {c.added} noi · {c.modified} modificate · {c.deactivated} dezactivate</li> : null;
    })}</ul> : null}
    {changes ? <p className="text-xs text-muted-foreground">Categorii: {changes.categoriesAdded.length} noi, {changes.categoriesRemoved.length} eliminate, {changes.categoriesChanged.length} modificate · Parametri imobiliari: {changes.parameters.length} diferențe</p> : null}
    {changes?.parameters.length ? <ul className="max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">{changes.parameters.map((p) => <li key={`${p.categoryId}-${p.code}-${p.kind}`}>Categoria {p.categoryId} · {p.code}: {({ added: "nou", removed: "eliminat", modified: "modificat", options: "opțiuni schimbate" } as const)[p.kind]}</li>)}</ul> : null}
  </div>;
}