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
import { StatusWithdrawPreview } from "@/components/app/StatusWithdrawPreview";

/** Confirmarea trecerii în Vândut / Închiriat / Arhivat, cu lista retragerilor. */
export function StatusChangeDialog({
  propertyIds,
  status,
  statusLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  propertyIds: string[];
  status: "sold" | "rented" | "archived" | null;
  statusLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={status !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Treci {propertyIds.length > 1 ? `${propertyIds.length} proprietăți` : "proprietatea"} în
            „{statusLabel}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Statusul se salvează imediat. Anunțurile se retrag de pe portaluri în fundal.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {status ? <StatusWithdrawPreview propertyIds={propertyIds} status={status} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Anulează</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>
            {pending ? "Se salvează…" : "Confirmă"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
