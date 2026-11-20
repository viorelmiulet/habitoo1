import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cloneToDevelopment } from "@/lib/developments/clone.functions";
import { errorMessage } from "@/lib/developments/error-message";
import type { CloneResult } from "@/lib/developments/clone";

export const allocateText = (n: number) => `Se vor crea ${n} ${n === 1 ? "copie nouă" : "copii noi"} cu referințe noi. Anunțurile originale rămân neschimbate.`;

export function AllocateResult({ result }: { result: CloneResult }) {
  return (
    <div className="space-y-2 text-sm" data-testid="allocate-result">
      {result.copies.length ? <ul className="space-y-0.5 font-mono">{result.copies.map((c) => <li key={c.copy_id}>{c.original_reference ?? c.original_id} → {c.copy_reference}</li>)}</ul> : <p>Nicio copie nouă.</p>}
      {result.skipped.length ? <div><p className="font-medium">Sărite</p><ul>{result.skipped.map((s) => <li key={s.original_id}>{s.original_reference ?? s.original_id}: {s.reason}</li>)}</ul></div> : null}
      {result.portalSkipped.length ? <div><p className="font-medium">Portaluri nebifate</p><ul>{result.portalSkipped.map((s, i) => <li key={i}>{s.portal}: {s.reason}</li>)}</ul></div> : null}
    </div>
  );
}

export function AllocateToDevelopmentDialog({ open, onOpenChange, propertyIds, developments, onDone, run }: {
  open: boolean; onOpenChange: (o: boolean) => void; propertyIds: string[];
  developments: { id: string; name: string }[]; onDone: () => void;
  run?: (input: { data: { developmentId: string; propertyIds: string[] } }) => Promise<CloneResult>;
}) {
  const serverRun = useServerFn(cloneToDevelopment);
  const call = run ?? serverRun;
  const [developmentId, setDevelopmentId] = useState(developments.length === 1 ? developments[0]!.id : "");
  const [result, setResult] = useState<CloneResult | null>(null);
  const m = useMutation({
    mutationFn: () => call({ data: { developmentId, propertyIds } }),
    onSuccess: (r) => { setResult(r); onDone(); },
    onError: (e) => { console.error(e); toast.error(errorMessage(e, "Copiile nu au putut fi create.")); },
  });
  const close = (o: boolean) => { if (!o) { setResult(null); setDevelopmentId(developments.length === 1 ? developments[0]!.id : ""); } onOpenChange(o); };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader><DialogTitle>Alocă la ansamblu</DialogTitle>
          {result ? null : <DialogDescription>{allocateText(propertyIds.length)}</DialogDescription>}</DialogHeader>
        {result ? <><AllocateResult result={result} /><Button onClick={() => close(false)}>Închide</Button></> : <>
          <Select value={developmentId} onValueChange={setDevelopmentId}>
            <SelectTrigger aria-label="Ansamblu"><SelectValue placeholder="Alege ansamblul" /></SelectTrigger>
            <SelectContent>{developments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
          {developments.length === 0 ? <p className="text-sm text-muted-foreground">Nu ai ansambluri pe care le poți edita.</p> : null}
          <Button disabled={!developmentId || !propertyIds.length || m.isPending} onClick={() => m.mutate()}>Creează {propertyIds.length} copii</Button>
        </>}
      </DialogContent>
    </Dialog>
  );
}

/** Butonul din bara de selecție: apare doar când există anunțuri selectate. */
export function AllocateAction({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) return null;
  return <Button variant="outline" size="sm" onClick={onClick}>Alocă la ansamblu</Button>;
}
