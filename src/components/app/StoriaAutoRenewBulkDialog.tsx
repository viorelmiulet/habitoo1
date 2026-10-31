import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { previewStoriaAutoRenewBulk, setStoriaAutoRenewBulk } from "@/lib/portals.functions";

type Choice = "on" | "off" | "inherit";
const OPTIONS: { value: Choice; label: string }[] = [
  { value: "on", label: "Activează" },
  { value: "off", label: "Dezactivează" },
  { value: "inherit", label: "Revino la setarea agenției" },
];

export function storiaChoiceToOverride(choice: Choice): boolean | null {
  return choice === "on" ? true : choice === "off" ? false : null;
}

export function StoriaAutoRenewBulkDialog({ open, propertyIds, organizationId, onClose, onDone }: {
  open: boolean; propertyIds: string[]; organizationId?: string; onClose: () => void; onDone: () => void;
}) {
  const [choice, setChoice] = useState<Choice>("on");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const preview = useServerFn(previewStoriaAutoRenewBulk);
  const save = useServerFn(setStoriaAutoRenewBulk);
  const org = organizationId ? { organizationId } : {};
  const counts = useQuery({
    queryKey: ["storia-auto-renew-bulk-preview", organizationId, [...propertyIds].sort()],
    enabled: open && propertyIds.length > 0,
    queryFn: () => preview({ data: { ...org, propertyIds } }),
  });

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await save({ data: { ...org, propertyIds, override: storiaChoiceToOverride(choice) } });
      toast.success(`${r.sent} anunțuri trimise la Storia, ${r.saved} salvate pentru următoarea publicare`);
      await queryClient.invalidateQueries({ queryKey: ["property-storia-auto-renew"] });
      await queryClient.invalidateQueries({ queryKey: ["property-publish-jobs"] });
      onDone();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg rounded-[18px] bg-card">
        <DialogHeader>
          <DialogTitle className="font-display">Prelungire automată Storia</DialogTitle>
          <DialogDescription>Pentru cele {propertyIds.length} anunțuri selectate. Nu se schimbă nimic altceva în anunț.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={choice} onValueChange={(v) => setChoice(v as Choice)} className="gap-2">
          {OPTIONS.map((o) => (
            <div key={o.value} className="flex items-center gap-2">
              <RadioGroupItem id={`storia-bulk-${o.value}`} value={o.value} />
              <Label htmlFor={`storia-bulk-${o.value}`}>{o.label}</Label>
            </div>
          ))}
        </RadioGroup>
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm" aria-live="polite">
          {counts.isLoading ? <p className="text-muted-foreground">Se calculează…</p> : counts.error ? <p className="text-destructive">{(counts.error as Error).message}</p> : counts.data ? (
            <ul className="space-y-1">
              <li><strong>{counts.data.sendNow}</strong> au anunț activ pe Storia — se actualizează acum la Storia</li>
              <li><strong>{counts.data.saveOnly}</strong> nu sunt publicate pe Storia — doar se salvează; se aplică la următoarea publicare</li>
              {counts.data.forbidden > 0 ? <li className="text-destructive"><strong>{counts.data.forbidden}</strong> nu îți sunt atribuite — deselectează-le pentru a continua</li> : null}
            </ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Anulează</Button>
          <Button onClick={confirm} disabled={busy || !counts.data || counts.data.forbidden > 0}>{busy ? "Se salvează…" : "Confirmă"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
