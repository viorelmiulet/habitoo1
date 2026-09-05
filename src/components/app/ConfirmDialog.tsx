import { useState, type ReactNode } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Dialog de confirmare reutilizabil. Suportă acțiuni asincrone (așteaptă
 * finalizarea și blochează butoanele) și confirmare prin text pentru
 * operațiuni ireversibile.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmă",
  cancelLabel = "Renunță",
  destructive = false,
  typeToConfirm,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Dacă e setat, utilizatorul trebuie să scrie exact acest text. */
  typeToConfirm?: string;
  onConfirm: () => void | Promise<unknown>;
  children?: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState("");
  const canConfirm = !pending && (!typeToConfirm || typed.trim() === typeToConfirm);

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canConfirm) return;
    try {
      setPending(true);
      await onConfirm();
      onOpenChange(false);
      setTyped("");
    } catch {
      // Eroarea este deja raportată de mutation (toast); dialogul rămâne deschis pentru reîncercare.
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (pending) return;
        if (!v) setTyped("");
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children}
        {typeToConfirm ? (
          <div className="space-y-2">
            <Label htmlFor="confirm-typed">
              Scrie <span className="font-mono font-semibold">{typeToConfirm}</span> pentru a confirma
            </Label>
            <Input
              id="confirm-typed"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn(
              destructive && "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
            )}
          >
            {pending ? "Se procesează…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
