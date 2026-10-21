/** Setări → Portaluri → Imobiliare.ro: imoradar24 automat + acțiunea unică (doar agency admin). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  getAutoImoradarSetting,
  setAutoImoradarSetting,
  startImoradarBackfill,
} from "@/lib/portals/imoradar.functions";
import { getRepublishBatch } from "@/lib/portals/republish.functions";

export function ImoradarAutoCard() {
  const queryClient = useQueryClient();
  const load = useServerFn(getAutoImoradarSetting);
  const save = useServerFn(setAutoImoradarSetting);
  const start = useServerFn(startImoradarBackfill);
  const loadBatch = useServerFn(getRepublishBatch);
  const key = ["imoradar-auto-setting"] as const;
  const view = useQuery({ queryKey: key, queryFn: () => load({ data: {} }) });
  const batchId = view.data?.activeBatchId ?? null;
  const batch = useQuery({
    queryKey: ["imoradar-batch", batchId],
    queryFn: () => loadBatch({ data: { batchId: batchId! } }),
    enabled: !!batchId,
    refetchInterval: (q) => (q.state.data?.status === "done" ? false : 5_000),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => save({ data: { enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });
  const run = useMutation({
    mutationFn: () => start({ data: {} }),
    onSuccess: (r) => {
      toast.success(`Pornit: ${r.queued} anunțuri de trimis, ${r.skipped} sărite.`);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (view.isLoading || !view.data?.connected) return null;
  const b = batch.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imobiliare.ro · imoradar24</CardTitle>
        <CardDescription>
          Anunțurile ajung pe imoradar24 doar dacă sunt trimise cu această opțiune. Nu pornește nicio altă promovare.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">Trimite automat anunțurile și pe imoradar24</span>
          <Switch
            checked={view.data.enabled}
            disabled={toggle.isPending}
            onCheckedChange={(next) => toggle.mutate(next)}
            aria-label="Trimite automat anunțurile și pe imoradar24"
          />
        </label>
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            disabled={run.isPending || !!batchId || view.data.otherBatchRunning}
            onClick={() => run.mutate()}
          >
            {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Trimite pe imoradar24 toate anunțurile publicate pe Imobiliare.ro
          </Button>
          <p className="text-xs text-muted-foreground">
            Se sar anunțurile care au deja imoradar24 pornit sau la care a fost oprit manual. Anunțurile nu se republică.
          </p>
          {view.data.otherBatchRunning ? (
            <p className="text-xs text-muted-foreground">O republicare rulează acum; încearcă după ce se termină.</p>
          ) : null}
          {b ? (
            <p className="text-sm">
              {b.status === "done" ? "Gata: " : `În curs (${b.pending} rămase): `}
              {b.succeeded} trimise, {b.skipped} sărite, {b.failed} erori.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
