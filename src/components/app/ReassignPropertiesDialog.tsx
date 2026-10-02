import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reassignProperties } from "@/lib/property-agent.functions";
import { toastError } from "@/lib/errors";

export type ReassignCandidate = { id: string; full_name: string | null };
type Summary = {
  moved: number;
  skipped: number;
  blocked: { id: string; reference: string | null; message: string }[];
  phoneWarnings: string[];
};

export const REASSIGN_UI_BATCH = 50;

/** Trimite anunțurile în loturi și cumulează rezultatul. */
export async function runReassignBatches(
  ids: string[],
  toUserId: string,
  call: (input: { data: { propertyIds: string[]; toUserId: string } }) => Promise<{
    moved: number;
    skipped: number;
    blocked: Summary["blocked"];
    phoneWarning: string | null;
  }>,
): Promise<Summary> {
  const total: Summary = { moved: 0, skipped: 0, blocked: [], phoneWarnings: [] };
  for (let i = 0; i < ids.length; i += REASSIGN_UI_BATCH) {
    const res = await call({ data: { propertyIds: ids.slice(i, i + REASSIGN_UI_BATCH), toUserId } });
    total.moved += res.moved;
    total.skipped += res.skipped;
    total.blocked.push(...res.blocked);
    if (res.phoneWarning && !total.phoneWarnings.includes(res.phoneWarning)) {
      total.phoneWarnings.push(res.phoneWarning);
    }
  }
  return total;
}

export function ReassignPropertiesDialog({
  open,
  onOpenChange,
  title,
  description,
  candidates,
  excludeUserId,
  loadIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  candidates: ReassignCandidate[];
  excludeUserId?: string | null;
  loadIds: () => Promise<string[]>;
  onDone?: () => void;
}) {
  const call = useServerFn(reassignProperties);
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const close = (v: boolean) => {
    if (pending) return;
    if (!v) {
      setTarget("");
      setSummary(null);
    }
    onOpenChange(v);
  };

  const confirm = async () => {
    if (!target) return;
    setPending(true);
    try {
      const ids = await loadIds();
      const res = ids.length
        ? await runReassignBatches(ids, target, call)
        : { moved: 0, skipped: 0, blocked: [], phoneWarnings: [] };
      setSummary(res);
      onDone?.();
    } catch (e) {
      toastError(e as Error);
    } finally {
      setPending(false);
    }
  };

  const options = candidates.filter((c) => c.id !== excludeUserId);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {summary ? (
          <div className="space-y-3 text-sm">
            <p>
              Mutate: <b>{summary.moved}</b> · Sărite (aveau deja agentul): <b>{summary.skipped}</b> ·
              Blocate: <b>{summary.blocked.length}</b>
            </p>
            {summary.blocked.length > 0 ? (
              <ul className="max-h-48 list-disc space-y-1 overflow-auto pl-5 text-destructive">
                {summary.blocked.map((b) => (
                  <li key={b.id}>
                    <span className="font-semibold">{b.reference ?? b.id.slice(0, 8)}</span>: {b.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {summary.phoneWarnings.map((w) => (
              <p key={w} className="font-semibold text-destructive">
                {w}
              </p>
            ))}
            <DialogFooter>
              <Button onClick={() => close(false)}>Închide</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Noul agent responsabil</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Alege utilizatorul" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Publicările pe portaluri rămân active; noul agent devine contact la următoarea
              sincronizare.
            </p>
            <DialogFooter>
              <Button variant="outline" disabled={pending} onClick={() => close(false)}>
                Renunță
              </Button>
              <Button disabled={!target || pending} onClick={confirm}>
                {pending ? "Se procesează…" : "Confirmă mutarea"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
