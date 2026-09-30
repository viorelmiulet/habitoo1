import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { deleteProperty } from "@/lib/property-delete.functions";

export const DELETE_PROPERTY_TEXT =
  "Anunțul va fi retras de pe toate portalurile și nu va mai fi vizibil în agenție. Doar administratorul platformei îl poate restabili.";

/** Cine vede „Șterge anunțul”: superadmin, admin de agenție sau agentul responsabil. */
export function canDeleteProperty(
  user: { isSuperadmin?: boolean; isAdmin?: boolean; userId?: string } | null | undefined,
  property: { assigned_to: string | null } | null | undefined,
): boolean {
  if (!user || !property) return false;
  return Boolean(user.isSuperadmin || user.isAdmin || (user.userId && property.assigned_to === user.userId));
}

export function DeletePropertyDialog({
  propertyId,
  open,
  onOpenChange,
  onDeleted,
}: {
  propertyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const run = useServerFn(deleteProperty);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ștergi anunțul?"
      description={DELETE_PROPERTY_TEXT}
      confirmLabel="Șterge anunțul"
      destructive
      onConfirm={async () => {
        if (!propertyId) return;
        try {
          await run({ data: { propertyId } });
        } catch (e) {
          toastError(e as Error);
          throw e;
        }
        toast.success("Anunțul a fost șters.");
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        queryClient.invalidateQueries({ queryKey: ["property-portals-matrix"] });
        onDeleted();
      }}
    />
  );
}
