/** SuperAdmin → Portaluri → Vumsi: corespondența categoriilor și a tipului de anunț, din snapshot. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getVumsiMappingState, saveVumsiMappings } from "@/lib/portals/vumsi/mappings.functions";

const key = (kind: string, tx: string) => `${kind}:${tx}`;
const selectCls = "h-8 w-full rounded-md border border-input bg-background px-2 text-xs";

export function VumsiMappingPanel() {
  const qc = useQueryClient();
  const load = useServerFn(getVumsiMappingState);
  const save = useServerFn(saveVumsiMappings);
  const state = useQuery({ queryKey: ["vumsi-mappings"], queryFn: () => load() });
  const [cats, setCats] = useState<Record<string, number | null>>({});
  const [types, setTypes] = useState<Record<string, number | null>>({});

  useEffect(() => {
    const d = state.data;
    if (!d) return;
    setCats(Object.fromEntries(d.rows.map((r) => [key(r.kind, r.transaction), r.savedId ?? r.suggestedId])));
    setTypes(Object.fromEntries(d.typeRows.map((r) => [r.transaction, r.savedValue ?? r.suggestedValue])));
  }, [state.data]);

  const mutation = useMutation({
    mutationFn: () => {
      const d = state.data!;
      return save({ data: {
        categories: d.rows.map((r) => ({ kind: r.kind, transaction: r.transaction, categoryId: cats[key(r.kind, r.transaction)] ?? null })),
        types: d.typeRows.map((r) => ({ transaction: r.transaction, value: types[r.transaction] ?? null })),
      } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vumsi-mappings"] }); toast.success("Corespondențele Vumsi au fost salvate."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = state.data;
  if (!d) return null;
  if (!d.hasSnapshot) return <p className="text-xs text-muted-foreground">Sincronizează nomenclatoarele Vumsi și setează corespondențele.</p>;

  return (
    <div className="w-full space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Corespondențe Vumsi</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {d.typeRows.map((r) => (
          <label key={r.transaction} className="space-y-1 text-xs">
            <span>Tip anunț la {r.txLabel}{r.savedValue === null ? " (sugestie, neconfirmată)" : ""}</span>
            <select className={selectCls} value={types[r.transaction] ?? ""} onChange={(e) => setTypes((s) => ({ ...s, [r.transaction]: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">—</option>
              {d.types.map((t) => <option key={t.value} value={t.value}>{t.value} · {t.label ?? t.code}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {d.rows.map((r) => {
          const k = key(r.kind, r.transaction);
          return (
            <label key={k} className="space-y-1 text-xs">
              <span>{r.kindLabel} · {r.txLabel}{r.savedId === null ? (r.suggestedId ? " (sugestie, neconfirmată)" : " (fără corespondență)") : ""}</span>
              <select className={selectCls} value={cats[k] ?? ""} onChange={(e) => setCats((s) => ({ ...s, [k]: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">—</option>
                {d.categories.map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
              </select>
            </label>
          );
        })}
      </div>
      <Button type="button" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Confirmă și salvează corespondențele</Button>
    </div>
  );
}
