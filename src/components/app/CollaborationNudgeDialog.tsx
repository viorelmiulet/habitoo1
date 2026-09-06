/**
 * Nudge prietenos afișat o singură dată per proprietate: dacă anunțul se salvează
 * sau se publică fără bifa de Colaborare, propunem activarea pe loc.
 * Nu blochează salvarea — „Continuă fără” are aceeași greutate vizuală.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CollaborationNudgeResult =
  | { enable: true; percent: number | null }
  | { enable: false };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onResolve: (result: CollaborationNudgeResult) => void;
};

export function CollaborationNudgeDialog({ open, onOpenChange, pending, onResolve }: Props) {
  const [percent, setPercent] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nu dorești să exporți și în Colaborare?</DialogTitle>
          <DialogDescription>
            Poți oferi anunțul și celorlalte agenții Habitoo, cu un comision de colaborare stabilit de tine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="nudge-collab-percent">Comision colaborare (%) — opțional</Label>
          <Input
            id="nudge-collab-percent"
            type="number"
            min="0"
            step="0.1"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            placeholder="ex. 1.5"
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() => onResolve({ enable: false })}
          >
            Continuă fără
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() =>
              onResolve({ enable: true, percent: percent.trim() === "" ? null : Number(percent) })
            }
          >
            Activează colaborarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
