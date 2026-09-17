/**
 * „Sloturi portaluri”: totalul agenției pe portal și alocarea fiecărui utilizator.
 * Câmp gol = nelimitat. Coborârea unei limite sub consum cere confirmarea explicită
 * a ofertelor care vor fi retrase de pe portal.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";

import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getPortalSlotAuditTrail,
  getPortalSlotMatrix,
  getPortalSlotWithdrawStatus,
  previewPortalSlotChange,
  setPortalSlotAllocation,
  setPortalSlotTotal,
} from "@/lib/portals/slots.functions";
import { toastError } from "@/lib/errors";

type PlannedWithdrawal = {
  propertyId: string;
  reference: string | null;
  title: string | null;
  agentName: string | null;
};

type PendingChange = {
  portalId: string;
  portalName: string;
  userId?: string;
  slots: number | null;
  withdrawals: PlannedWithdrawal[];
};

/** Câmp gol = nelimitat; altfel un întreg pozitiv. */
function parseSlots(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false };
  return { ok: true, value: Number(trimmed) };
}

function formatSlots(value: number | null): string {
  return value === null ? "" : String(value);
}

export function PortalSlotsCard({ organizationId }: { organizationId?: string }) {
  const queryClient = useQueryClient();
  const loadMatrix = useServerFn(getPortalSlotMatrix);
  const loadTrail = useServerFn(getPortalSlotAuditTrail);
  const loadStatus = useServerFn(getPortalSlotWithdrawStatus);
  const preview = useServerFn(previewPortalSlotChange);
  const saveTotal = useServerFn(setPortalSlotTotal);
  const saveAllocation = useServerFn(setPortalSlotAllocation);

  const args = useMemo(() => (organizationId ? { organizationId } : {}), [organizationId]);

  const matrix = useQuery({
    queryKey: ["portal-slot-matrix", organizationId ?? "session"],
    queryFn: () => loadMatrix({ data: args }),
  });
  const trail = useQuery({
    queryKey: ["portal-slot-trail", organizationId ?? "session"],
    queryFn: () => loadTrail({ data: args }),
  });
  const status = useQuery({
    queryKey: ["portal-slot-withdraw-status", organizationId ?? "session"],
    queryFn: () => loadStatus({ data: args }),
    // Retragerile rulează pe server; reîmprospătăm cât timp jobul e activ.
    refetchInterval: (query) =>
      query.state.data && ["queued", "running"].includes(query.state.data.status) ? 5_000 : false,
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [busy, setBusy] = useState(false);

  // Valorile din server devin valorile din câmpuri la fiecare reîncărcare.
  useEffect(() => {
    if (!matrix.data) return;
    const next: Record<string, string> = {};
    for (const portal of matrix.data.portals) {
      next[`total:${portal.portalId}`] = formatSlots(portal.agencyTotal);
      for (const cell of portal.cells) {
        next[`user:${portal.portalId}:${cell.userId}`] = formatSlots(cell.total);
      }
    }
    setDrafts(next);
  }, [matrix.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["portal-slot-matrix"] });
    void queryClient.invalidateQueries({ queryKey: ["portal-slot-trail"] });
    void queryClient.invalidateQueries({ queryKey: ["portal-slot-withdraw-status"] });
  };

  const persist = async (change: PendingChange, confirmed: boolean) => {
    setBusy(true);
    try {
      const result = change.userId
        ? await saveAllocation({
            data: {
              ...args,
              portalId: change.portalId,
              userId: change.userId,
              slots: change.slots,
              confirmWithdrawals: confirmed,
            },
          })
        : await saveTotal({
            data: {
              ...args,
              portalId: change.portalId,
              totalSlots: change.slots,
              confirmWithdrawals: confirmed,
            },
          });

      if (result.ok === false) {
        // Serverul cere confirmarea retragerilor înainte de salvare.
        setPending({ ...change, withdrawals: result.withdrawals });
        return;
      }

      setPending(null);
      if (result.withdrawals.length > 0) {
        toast.success(
          `Salvat. ${result.withdrawals.length} ${result.withdrawals.length === 1 ? "ofertă va fi retrasă" : "oferte vor fi retrase"} de pe ${change.portalName}.`,
        );
      } else {
        toast.success("Locurile de publicare au fost salvate.");
      }
      if (result.queueError) toast.error(result.queueError);
      refresh();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (change: Omit<PendingChange, "withdrawals">) => {
    setBusy(true);
    try {
      const planned = await preview({
        data: {
          ...args,
          portalId: change.portalId,
          ...(change.userId
            ? { userId: change.userId, slots: change.slots }
            : { totalSlots: change.slots }),
        },
      });
      if (planned.withdrawals.length > 0) {
        setPending({ ...change, withdrawals: planned.withdrawals });
        setBusy(false);
        return;
      }
    } catch (error) {
      toastError(error);
      setBusy(false);
      return;
    }
    setBusy(false);
    await persist({ ...change, withdrawals: [] }, false);
  };

  const onSave = (key: string, change: Omit<PendingChange, "withdrawals" | "slots">) => {
    const parsed = parseSlots(drafts[key] ?? "");
    if (!parsed.ok) {
      toast.error("Introdu un număr întreg de locuri sau lasă câmpul gol pentru nelimitat.");
      return;
    }
    void submit({ ...change, slots: parsed.value });
  };

  if (matrix.isLoading) return <InlineLoading label="Se încarcă locurile de publicare…" />;
  if (matrix.isError) return <QueryError error={matrix.error} onRetry={() => matrix.refetch()} />;

  const data = matrix.data;
  const job = status.data;

  return (
    <section className="panel">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Sloturi portaluri</h2>
        <p className="text-xs text-muted-foreground">
          Câte oferte poate avea publicate fiecare agent pe fiecare portal. Câmp gol = nelimitat.
          Locul este consumat de agentul responsabil al ofertei.
        </p>
      </header>

      {job && ["queued", "running"].includes(job.status) ? (
        <p className="border-b border-border bg-muted/40 px-5 py-3 text-xs">
          Se retrag ofertele care nu mai încap pe {job.portalName}: {job.done}/{job.total} finalizate
          {job.failed > 0 ? `, ${job.failed} eșuate` : ""}.
        </p>
      ) : null}

      {job && job.failures.length > 0 ? (
        <div className="border-b border-border px-5 py-3 text-xs">
          <p className="font-medium">Oferte care nu au putut fi retrase de pe {job.portalName}:</p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {job.failures.map((failure) => (
              <li key={failure.propertyId}>
                {failure.propertyId} — {failure.error ?? "eroare necunoscută"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data && data.portals.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Agenția nu are încă niciun portal activat.
        </p>
      ) : null}

      {data?.portals.map((portal) => (
        <div key={portal.portalId} className="border-b border-border px-5 py-4 last:border-b-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{portal.portalName}</h3>
              <p className="text-xs text-muted-foreground">
                Total folosit: {portal.agencyUsed}
                {portal.agencyTotal === null ? " (nelimitat)" : ` / ${portal.agencyTotal}`}
              </p>
            </div>
            <div className="flex items-end gap-2">
              <Input
                aria-label={`Total locuri ${portal.portalName}`}
                className="w-28"
                inputMode="numeric"
                placeholder="nelimitat"
                value={drafts[`total:${portal.portalId}`] ?? ""}
                onChange={(event) =>
                  setDrafts((cur) => ({ ...cur, [`total:${portal.portalId}`]: event.target.value }))
                }
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  onSave(`total:${portal.portalId}`, {
                    portalId: portal.portalId,
                    portalName: portal.portalName,
                  })
                }
              >
                Salvează totalul
              </Button>
            </div>
          </div>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">Utilizator</th>
                <th className="py-1">Folosite</th>
                <th className="py-1">Alocate</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => {
                const cell = portal.cells.find((row) => row.userId === user.userId);
                const key = `user:${portal.portalId}:${user.userId}`;
                return (
                  <tr key={user.userId} className="border-t border-border">
                    <td className="py-2">{user.name}</td>
                    <td className="py-2">{cell?.used ?? 0}</td>
                    <td className="py-2">
                      <Input
                        aria-label={`Locuri ${user.name} ${portal.portalName}`}
                        className="w-24"
                        inputMode="numeric"
                        placeholder="nelimitat"
                        value={drafts[key] ?? ""}
                        onChange={(event) =>
                          setDrafts((cur) => ({ ...cur, [key]: event.target.value }))
                        }
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          onSave(key, {
                            portalId: portal.portalId,
                            portalName: portal.portalName,
                            userId: user.userId,
                          })
                        }
                      >
                        Salvează
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {(trail.data ?? []).length > 0 ? (
        <div className="border-t border-border px-5 py-4">
          <h3 className="text-xs font-semibold tracking-wide uppercase">Istoric modificări</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {(trail.data ?? []).map((entry) => (
              <li key={entry.id}>
                {entry.createdAt ? new Date(entry.createdAt).toLocaleString("ro-RO") : "—"} —{" "}
                {entry.actorName ?? "necunoscut"} a schimbat{" "}
                {entry.userName ? `alocarea lui ${entry.userName}` : "totalul agenției"} pe{" "}
                {entry.portalName ?? "portal"} din{" "}
                {entry.previous === null ? "nelimitat" : entry.previous} în{" "}
                {entry.next === null ? "nelimitat" : entry.next}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Oferte care vor fi retrase</AlertDialogTitle>
            <AlertDialogDescription>
              Noua limită este sub numărul de oferte publicate. La salvare, aceste oferte vor fi
              retrase de pe {pending?.portalName}. Anularea nu schimbă nimic.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-60 space-y-1 overflow-auto text-sm">
            {(pending?.withdrawals ?? []).map((item) => (
              <li key={item.propertyId}>
                {item.reference ? `${item.reference} — ` : ""}
                {item.title ?? item.propertyId}
                {item.agentName ? ` (${item.agentName})` : ""}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Anulează</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (pending) void persist(pending, true);
              }}
            >
              Salvează și retrage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
