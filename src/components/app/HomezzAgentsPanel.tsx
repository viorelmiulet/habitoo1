import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { activateHomezzAgentFn, getHomezzAgents, setHomezzAgentPromotionsFn } from "@/lib/agency-portal-setup.functions";
import { Input } from "@/components/ui/input";

export const HOMEZZ_ACTIVATION_WARNING =
  "Dacă acest email are deja cont pe HomeZZ.ro, anunțurile lui de pe HomeZZ.ro și Lajumate.ro vor fi dezactivate automat, iar agentul nu le va mai putea administra din contul lui. Prin activare, agentul acceptă Termenii și Politica de confidențialitate HomeZZ.ro.";

/** Agenții agenției la HomeZZ; activare doar individuală, cu confirmare bifată. */
export function HomezzAgentsPanel({ organizationId }: { organizationId?: string | undefined }) {
  const qc = useQueryClient();
  const key = ["homezz-agents", organizationId ?? "self"] as const;
  const load = useServerFn(getHomezzAgents);
  const run = useServerFn(activateHomezzAgentFn);
  const roster = useQuery({ queryKey: key, queryFn: () => load({ data: organizationId ? { organizationId } : {} }) });
  const savePromos = useServerFn(setHomezzAgentPromotionsFn);
  const [promoDraft, setPromoDraft] = useState<Record<string, string>>({});
  const promo = useMutation({
    mutationFn: (v: { userId: string; id: number; value: number }) =>
      savePromos({ data: { ...(organizationId ? { organizationId } : {}), userId: v.userId, promotions: { [String(v.id)]: v.value } } }),
    onSuccess: () => { toast.success("Promovările agentului au fost actualizate pe HomeZZ."); void qc.invalidateQueries({ queryKey: key }); },
    // Refuzul HomeZZ (de ex. peste contract) apare cu textul exact.
    onError: (e) => toastError(e),
  });
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
              {m.active && m.promotions.length ? (
                <div className="mt-2 flex flex-wrap gap-3" data-homezz-agent-promotions>
                  {m.promotions.map((p) => {
                    const k = `${m.userId}:${p.id}`;
                    const val = promoDraft[k] ?? String(p.total ?? 0);
                    return (
                      <label key={p.id} className="flex items-center gap-1.5 text-xs">
                        <span>{p.label}: {p.remaining ?? "–"} rămase din</span>
                        <Input className="h-8 w-16" inputMode="numeric" value={val}
                          onChange={(e) => setPromoDraft((d) => ({ ...d, [k]: e.target.value.replace(/\D/g, "") }))} />
                        <Button type="button" size="compact" variant="outline"
                          disabled={promo.isPending || val === "" || Number(val) === (p.total ?? 0)}
                          onClick={() => promo.mutate({ userId: m.userId, id: p.id, value: Number(val) })}>Salvează</Button>
                      </label>
                    );
                  })}
                </div>
              ) : null}
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
