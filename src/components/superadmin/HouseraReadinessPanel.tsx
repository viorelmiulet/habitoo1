import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getHouseraReadiness } from "@/lib/portals/housera.functions";

/** SuperAdmin → Portaluri → Housera: mediul activ și „Pregătire producție”. */
export function HouseraReadinessPanel() {
  const load = useServerFn(getHouseraReadiness);
  const q = useQuery({ queryKey: ["housera-readiness"], queryFn: () => load() });
  const r = q.data;
  if (!r) return null;
  return (
    <div className="w-full space-y-3 rounded-[14px] border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">Pregătire producție</h4>
        <Badge variant={r.env === "production" ? "default" : "secondary"}>{r.env === "production" ? "Producție" : "Test"}</Badge>
      </div>
      <ul className="space-y-2">
        {r.items.map((i) => (
          <li key={i.id} className="flex gap-2 text-sm">
            {i.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <span>
              {i.label}
              {i.note ? <span className="block text-[13px] text-muted-foreground">{i.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
