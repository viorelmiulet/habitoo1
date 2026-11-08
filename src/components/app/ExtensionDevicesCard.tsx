import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { listExtensionTokens, revokeExtensionToken } from "@/lib/extension.functions";

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" }) : "—");

export function ExtensionDevicesCard() {
  const list = useServerFn(listExtensionTokens);
  const revoke = useServerFn(revokeExtensionToken);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["extension-tokens"], queryFn: () => list() });
  const m = useMutation({ mutationFn: (id: string) => revoke({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["extension-tokens"] }) });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Se încarcă…</p>;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">Niciun dispozitiv conectat. Instalează extensia Habitoo Captură și apasă „Conectează” în ea.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-medium">{r.device_name}</p>
            <p className="text-xs text-muted-foreground">Conectat la {fmt(r.created_at)} · Ultima utilizare {fmt(r.last_used_at)}</p>
          </div>
          <Button variant="outline" size="sm" disabled={m.isPending} onClick={() => m.mutate(r.id)}>Deconectează</Button>
        </li>
      ))}
    </ul>
  );
}
