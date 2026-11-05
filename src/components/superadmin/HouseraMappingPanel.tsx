import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getHouseraSchemaStatus, listHouseraPreviewProperties, previewHouseraMapping, refreshHouseraSchemaNow,
} from "@/lib/portals/housera.functions";

/** SuperAdmin → Portaluri → Housera: nomenclator + previzualizarea mapării (fără apel către Housera). */
export function HouseraMappingPanel({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const loadStatus = useServerFn(getHouseraSchemaStatus);
  const refresh = useServerFn(refreshHouseraSchemaNow);
  const listProps = useServerFn(listHouseraPreviewProperties);
  const preview = useServerFn(previewHouseraMapping);
  const [propertyId, setPropertyId] = useState("");
  const status = useQuery({ queryKey: ["housera-schema"], queryFn: () => loadStatus() });
  const props = useQuery({ queryKey: ["housera-preview-props", organizationId], queryFn: () => listProps({ data: { organizationId } }) });
  const refreshM = useMutation({
    mutationFn: () => refresh(),
    onSuccess: (r) => { toast.success(r.status === "updated" ? "Nomenclatorul Housera a fost actualizat." : "Nomenclatorul Housera este neschimbat."); void qc.invalidateQueries({ queryKey: ["housera-schema"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const previewM = useMutation({
    mutationFn: () => preview({ data: { organizationId, propertyId } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const s = status.data;
  const affected = s?.synced ? s.affected : null;
  return (
    <div className="w-full space-y-4 rounded-[14px] border border-border bg-card p-4 sm:p-5">
      <div className="space-y-2">
        <h3 className="text-base font-bold">Nomenclator Housera</h3>
        <p className="text-[13px] text-muted-foreground">
          {s?.synced ? `Mediu ${s.env} · ${s.featureCount} dotări · verificat ${new Date(s.fetchedAt).toLocaleString("ro-RO")}` : "Nesincronizat încă."}
        </p>
        {affected && (affected.retired.length > 0 || affected.withdrawn.length > 0) ? (
          <div role="alert" className="rounded-xl bg-gold-tint p-3 text-sm">
            <p className="font-semibold">Coduri din maparea Habitoo schimbate de Housera:</p>
            <ul className="mt-1 list-disc pl-5">
              {affected.retired.map((r) => <li key={`r-${r.kind}-${r.code}`}>Retras: {r.kind} „{r.code}” → „{r.replaced_by}”</li>)}
              {affected.withdrawn.map((w) => <li key={`w-${w.kind}-${w.code}`}>Scos: {w.kind} „{w.code}”</li>)}
            </ul>
          </div>
        ) : null}
        <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={refreshM.isPending} onClick={() => refreshM.mutate()}>
          <RefreshCw className="mr-2 size-4" />Actualizează nomenclatorul
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="housera-preview-property">Previzualizează maparea</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger id="housera-preview-property" className="sm:max-w-md"><SelectValue placeholder="Alege o proprietate" /></SelectTrigger>
            <SelectContent>
              {(props.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" className="w-full sm:w-auto" disabled={!propertyId || previewM.isPending} onClick={() => previewM.mutate()}>
            <Eye className="mr-2 size-4" />Previzualizează maparea
          </Button>
        </div>
        {previewM.data ? (
          <div className="space-y-3">
            {previewM.data.listings.length === 0 && previewM.data.errors.length ? <Issues title="Erori blocante" items={previewM.data.errors} danger /> : null}
            {previewM.data.listings.map((l) => (
              <div key={l.externalRef} className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-sm font-semibold">{l.transaction === "sale" ? "Vânzare" : "Închiriere"} · <span className="font-mono text-[13px]">{l.externalRef}</span></p>
                {l.errors.length ? <Issues title="Erori blocante" items={l.errors} danger /> : <p className="text-sm text-success">Fără erori blocante.</p>}
                {l.warnings.length ? <Issues title="Avertismente" items={l.warnings} /> : null}
                <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(l.payload, null, 2)}</pre>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Issues({ title, items, danger }: { title: string; items: string[]; danger?: boolean }) {
  return (
    <div className={danger ? "rounded-xl bg-danger-tint p-3 text-sm text-destructive" : "rounded-xl bg-gold-tint p-3 text-sm"}>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
