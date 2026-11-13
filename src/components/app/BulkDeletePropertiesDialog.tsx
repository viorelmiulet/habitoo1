import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { deleteProperties } from "@/lib/property-delete.functions";

export function bulkDeleteTitle(n: number) {
  return `Ștergi ${n} ${n === 1 ? "proprietate" : "proprietăți"}?`;
}

/** Textul rezultatului afișat după ștergerea în masă. */
export function bulkDeleteSummary(out: { deleted: string[]; queued: number; failed: { reason: string }[] }) {
  const ok = `${out.deleted.length} proprietăți șterse; ${out.queued} retrageri de pe portaluri puse în coadă`;
  return { ok, failed: out.failed.length ? `${out.failed.length} nu au putut fi șterse` : null };
}

export function BulkDeletePropertiesDialog({
  propertyIds,
  references,
  onClose,
  onDone,
}: {
  propertyIds: string[] | null;
  references: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const run = useServerFn(deleteProperties);
  const ids = propertyIds ?? [];
  const n = ids.length;
  const published = useQuery({
    queryKey: ["bulk-delete-published", ids],
    enabled: n > 0,
    queryFn: async () => {
      const [pubs, mls] = await Promise.all([
        supabase.from("portal_publications").select("property_id").in("property_id", ids).eq("enabled", true),
        supabase.from("properties").select("id").in("id", ids).eq("collaboration", true),
      ]);
      const set = new Set<string>();
      for (const r of pubs.data ?? []) set.add(r.property_id as string);
      for (const r of mls.data ?? []) set.add(r.id as string);
      return set.size;
    },
  });
  const x = published.data ?? 0;
  return (
    <ConfirmDialog
      open={propertyIds !== null}
      onOpenChange={(o) => !o && onClose()}
      title={bulkDeleteTitle(n)}
      description={
        <>
          {x > 0 ? <>{x} sunt publicate pe portaluri/MLS și vor fi retrase automat. </> : null}
          Proprietățile nu vor mai fi vizibile în agenție. Doar administratorul platformei (superadmin) le poate restaura.
        </>
      }
      confirmLabel={`Șterge ${n} ${n === 1 ? "proprietate" : "proprietăți"}`}
      cancelLabel="Renunță"
      destructive
      onConfirm={async () => {
        try {
          for (let i = 0; i < ids.length; i += 200) {
            const out = await run({ data: { propertyIds: ids.slice(i, i + 200) } });
            const s = bulkDeleteSummary(out);
            toast.success(s.ok);
            if (s.failed) {
              toast.error(s.failed, {
                description: out.failed.map((f) => `${references[f.propertyId] ?? f.propertyId}: ${f.reason}`).join("\n"),
              });
            }
          }
        } catch (e) {
          toastError(e as Error);
          throw e;
        }
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        queryClient.invalidateQueries({ queryKey: ["property-portals-matrix"] });
        onDone();
        onClose();
      }}
    />
  );
}
