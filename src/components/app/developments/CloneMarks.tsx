import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type CopyOf = { id: string; reference: string | null };
export type CopiedIn = { copyId: string; developmentId: string; developmentName: string | null };

/** „Copie a {ref}” pe copie și „Copiat în: {ansamblu}” pe original, cu link-uri. */
export function CloneMarks({ copyOf, copiedIn = [] }: { copyOf?: CopyOf | null; copiedIn?: CopiedIn[] }) {
  if (!copyOf && !copiedIn.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" data-testid="clone-marks">
      {copyOf ? (
        <span className="text-muted-foreground">
          Copie a{" "}
          <Link to="/app/properties/$id" params={{ id: copyOf.id }} className="font-mono text-primary hover:underline">
            {copyOf.reference ?? "original"}
          </Link>
        </span>
      ) : null}
      {copiedIn.map((c) => (
        <Link key={c.copyId} to="/app/properties/$id" params={{ id: c.copyId }}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium text-foreground hover:border-primary hover:text-primary">
          <Copy className="size-3" aria-hidden />Copiat în: {c.developmentName || "—"}
        </Link>
      ))}
    </div>
  );
}

type Row = { id: string; cloned_from_property_id?: string | null };
/** Încarcă legăturile copie/original pentru rândurile afișate (RLS-ul apelantului). */
export function useCloneLinks(rows: Row[], developmentName: (id: string) => string | null | undefined) {
  const ids = rows.map((r) => r.id);
  const originIds = [...new Set(rows.map((r) => r.cloned_from_property_id).filter((x): x is string => Boolean(x)))];
  const { data } = useQuery({
    queryKey: ["clone-links", ids, originIds],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [copies, origins] = await Promise.all([
        supabase.from("properties").select("id,cloned_from_property_id,development_id").in("cloned_from_property_id", ids).is("deleted_at", null).not("development_id", "is", null),
        originIds.length ? supabase.from("properties").select("id,reference").in("id", originIds) : Promise.resolve({ data: [] as { id: string; reference: string | null }[] }),
      ]);
      return { copies: copies.data ?? [], origins: origins.data ?? [] };
    },
  });
  return (row: Row) => ({
    copyOf: row.cloned_from_property_id
      ? { id: row.cloned_from_property_id, reference: data?.origins.find((o) => o.id === row.cloned_from_property_id)?.reference ?? null }
      : null,
    copiedIn: (data?.copies ?? []).filter((c) => c.cloned_from_property_id === row.id)
      .map((c) => ({ copyId: c.id, developmentId: c.development_id as string, developmentName: developmentName(c.development_id as string) ?? null })),
  });
}
