import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { activateHomezzAgentFn, getHomezzAgents } from "@/lib/agency-portal-setup.functions";

export const HOMEZZ_ACTIVATION_WARNING =
  "Dacă acest email are deja cont pe HomeZZ.ro, anunțurile lui de pe HomeZZ.ro și Lajumate.ro vor fi dezactivate automat, iar agentul nu le va mai putea administra din contul lui. Prin activare, agentul acceptă Termenii și Politica de confidențialitate HomeZZ.ro.";

/** Agenții agenției la HomeZZ; activare doar individuală, cu confirmare bifată. */
export function HomezzAgentsPanel({ organizationId }: { organizationId?: string | undefined }) {
  const qc = useQueryClient();
  const key = ["homezz-agents", organizationId ?? "self"] as const;
  const load = useServerFn(getHomezzAgents);
  const run = useServerFn(activateHomezzAgentFn);
  const roster = useQuery({ queryKey: key, queryFn: () => load({ data: organizationId ? { organizationId } : {} }) });
  const [target, setTarget] = useState<{ userId: string; name: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const activate = useMutation({
    mutationFn: (userId: string) => run({ data: { ...(organizationId ? { organizationId } : {}), userId, confirmed: true } }),
    onSuccess: () => { toast.success("Agentul a fost activat pe HomeZZ."); setTarget(null); void qc.invalidateQueries({ queryKey: key }); },
    onError: toastError,
  });
  return (
    <section className="space-y-2" data-homezz-agents>
      <h3 className="text-sm font-semibold">Agenți HomeZZ</h3>
      {roster.isLoading ? <p className="text-sm text-muted-foreground">Se încarcă…</p> : null}
      {roster.error ? <p role="alert" className="text-sm text-destructive">{roster.error.message}</p> : null}
      {roster.data?.error ? <p role="alert" className="text-sm text-destructive">{roster.data.error}</p> : null}
      <ul className="divide-y rounded-md border">
        {(roster.data?.members ?? []).map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">
                {m.active ? `Activ · ${m.assignedSlots ?? "–"} sloturi alocate, ${m.remainingSlots ?? "–"} rămase` : "Neactivat"}
                {m.allocation === null ? " · fără alocare HomeZZ" : ` · alocare Habitoo: ${m.allocation}`}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => { setConfirmed(false); setTarget({ userId: m.userId, name: m.name }); }}>
              Activează pe HomeZZ
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={target !== null} onOpenChange={(o) => { if (!o) setTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activezi {target?.name} pe HomeZZ?</DialogTitle>
            <DialogDescription>{HOMEZZ_ACTIVATION_WARNING}</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} /> Am înțeles și confirm
          </label>
          <DialogFooter>
            <Button type="button" disabled={!confirmed || activate.isPending} onClick={() => { if (confirmed && target) activate.mutate(target.userId); }}>
              Activează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
