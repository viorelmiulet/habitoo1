/**
 * Coloana „Fișă” din lista Proprietăți: același „Grad de completare” ca în fișă
 * (computeCompleteness + completenessInputFromRow), cu agregate încărcate în lot.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeCompleteness, completenessInputFromRow, sheetTone } from "@/lib/property-completeness";
import { cn } from "@/lib/utils";

export type CompletenessExtra = { hasCover: boolean; imageCount: number };
const EMPTY: CompletenessExtra = { hasCover: false, imageCount: 0 };

/** O interogare pe poze pentru toate rândurile paginii. */
export function useCompletenessExtras(ids: string[]) {
  const { data = {} } = useQuery({
    queryKey: ["properties-completeness-extras", ids],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const imgs = await supabase.from("property_images").select("property_id").in("property_id", ids);
      if (imgs.error) throw imgs.error;
      const out: Record<string, CompletenessExtra> = {};
      for (const id of ids) out[id] = { ...EMPTY };
      for (const r of imgs.data ?? []) {
        const e = out[r.property_id as string];
        if (e) { e.imageCount += 1; e.hasCover = true; }
      }
      return out;
    },
  });
  return (id: string): CompletenessExtra => data[id] ?? EMPTY;
}

export function ListCompletenessCell({ row, extra }: { row: Record<string, unknown>; extra: CompletenessExtra }) {
  const result = computeCompleteness(completenessInputFromRow(row, extra));
  const pct = result.percent;
  const tone = sheetTone(pct);
  const missing = result.items.filter((i) => !i.done).map((i) => i.label);
  const tip = missing.length ? `Lipsesc: ${missing.join(", ")}` : "Fișă completă";
  return (
    <div className="min-w-0 self-end lg:self-center" title={tip} aria-label={`Grad de completare ${pct}%. ${tip}`} data-testid="list-completeness">
      <span className="font-mono text-xs">{pct}%</span>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone === "success" ? "bg-success" : tone === "ai" ? "bg-ai" : "bg-gold")} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}
