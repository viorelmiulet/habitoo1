import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestImpersonation } from "@/lib/impersonation.functions";

/** Superadminul cere acces; motivul (min. 10 caractere) ajunge la utilizator și în audit. */
export function ImpersonationRequestDialog({
  open,
  onOpenChange,
  targetUserId,
  targetLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string | null;
  targetLabel: string;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useServerFn(requestImpersonation);
  const queryClient = useQueryClient();

  const submit = async () => {
    if (!targetUserId) return;
    if (reason.trim().length < 10) {
      toast.error("Motivul trebuie să aibă cel puțin 10 caractere.");
      return;
    }
    setBusy(true);
    try {
      const res = await request({ data: { targetUserId, reason: reason.trim() } });
      toast.success(
        res.emailSent
          ? "Cererea a fost trimisă. Utilizatorul a primit notificare în aplicație și pe email."
          : "Cererea a fost trimisă. Utilizatorul o vede în aplicație.",
      );
      setReason("");
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["impersonation-requests"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cererea nu a putut fi trimisă.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicită acces la contul utilizatorului</DialogTitle>
          <DialogDescription>
            {targetLabel} trebuie să aprobe explicit. Accesul durează 24 de ore de la aprobare, iar
            cererea expiră în 48 de ore dacă nu primește răspuns.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="impersonation-reason">Motivul accesului</Label>
          <Textarea
            id="impersonation-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Ex.: investigăm eroarea raportată la publicarea pe Storia"
          />
          <p className="text-xs text-muted-foreground">
            Minim 10 caractere. Motivul este vizibil utilizatorului și rămâne în jurnalul de audit.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Renunță
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            Trimite cererea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
