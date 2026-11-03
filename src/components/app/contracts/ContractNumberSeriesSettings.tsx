import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { NUMBERED_CONTRACT_KINDS, printedContractNumber, type NumberedContractKind } from "@/lib/contracts/numbering";
import { getContractNumberSeries, saveContractNumberSeries } from "@/lib/contracts/numbering.functions";

const labels = { commission: "Comision", viewing: "Vizionare", exclusive_representation: "Reprezentare exclusivă" };

function SeriesRow({ kind, series, nextNumber, organizationId }: {
  kind: NumberedContractKind; series: string; nextNumber: number; organizationId: string;
}) {
  const [draftSeries, setSeries] = useState(series);
  const [draftNumber, setNumber] = useState(String(nextNumber));
  const queryClient = useQueryClient();
  const save = useServerFn(saveContractNumberSeries);
  useEffect(() => { setSeries(series); setNumber(String(nextNumber)); }, [series, nextNumber]);
  const mutation = useMutation({
    mutationFn: () => save({ data: { kind, series: draftSeries, nextNumber: Number(draftNumber) } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contract-number-series", organizationId] });
      toast.success("Numerotarea contractelor a fost salvată.");
    },
    onError: (error: Error) => toastError(error),
  });
  return (
    <form className="grid min-w-0 gap-3 border-b border-border py-5 last:border-0 sm:grid-cols-[minmax(0,1fr)_120px_160px_auto] sm:items-end"
      onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-semibold">{labels[kind]}</h3>
        <p className="break-words text-xs text-muted-foreground">Următorul contract: {printedContractNumber(draftSeries, Number(draftNumber) >= 1 ? Number(draftNumber) : null) || "—"}</p>
      </div>
      <div className="space-y-2"><Label htmlFor={`series-${kind}`}>Seria</Label>
        <Input id={`series-${kind}`} maxLength={20} value={draftSeries} onChange={(event) => setSeries(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor={`number-${kind}`}>Numărul de început</Label>
        <Input id={`number-${kind}`} type="number" required min={1} max={2147483646} step={1} value={draftNumber} onChange={(event) => setNumber(event.target.value)} /></div>
      <Button type="submit" disabled={mutation.isPending} aria-label={`Salvează numerotarea ${labels[kind]}`}>
        {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvează
      </Button>
    </form>
  );
}

export function ContractNumberSeriesSettings({ organizationId }: { organizationId: string }) {
  const fetchSeries = useServerFn(getContractNumberSeries);
  const query = useQuery({ queryKey: ["contract-number-series", organizationId], queryFn: () => fetchSeries() });
  return (
    <section className="mt-6 min-w-0 border-t border-border pt-6" aria-labelledby="contract-number-settings">
      <h2 id="contract-number-settings" className="font-display text-lg font-semibold">Numerotare contracte</h2>
      {query.isPending ? <Loader2 className="mt-4 size-5 animate-spin" aria-label="Se încarcă numerotarea" /> : query.isError ?
        <p role="alert" className="mt-4 text-sm text-destructive">Numerotarea contractelor nu a putut fi citită.</p> :
        NUMBERED_CONTRACT_KINDS.map((kind) => {
          const row = query.data.find((value) => value.kind === kind);
          return <SeriesRow key={kind} kind={kind} series={row?.series ?? ""} nextNumber={row?.next_number ?? 1} organizationId={organizationId} />;
        })}
    </section>
  );
}