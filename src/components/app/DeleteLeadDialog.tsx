import { useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";

export const DELETE_LEAD_TEXT =
  "Lead-ul nu va mai fi vizibil în agenție. Doar administratorul platformei îl poate restabili.";

/** Aceeași regulă ca `leads_sel` / `delete_lead`: admin, superadmin sau lead-ul propriu. */
export function canDeleteLead(
  user: { isSuperadmin?: boolean; isAdmin?: boolean; userId?: string } | null | undefined,
  lead: { assigned_to: string | null; created_by: string | null } | null | undefined,
): boolean {
  if (!user || !lead) return false;
  if (user.isSuperadmin || user.isAdmin) return true;
  if (!user.userId) return false;
  return lead.assigned_to === user.userId || (lead.assigned_to === null && lead.created_by === user.userId);
}

export function DeleteLeadDialog({
  leadId,
  open,
  onOpenChange,
  onDeleted,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ștergi lead-ul?"
      description={DELETE_LEAD_TEXT}
      confirmLabel="Șterge lead-ul"
      destructive
      onConfirm={async () => {
        if (!leadId) return;
        const { error } = await supabase.rpc("delete_lead", { _id: leadId });
        if (error) {
          toastError(error);
          throw error;
        }
        toast.success("Lead-ul a fost șters.");
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        onDeleted();
      }}
    />
  );
}
