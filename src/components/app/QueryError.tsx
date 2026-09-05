import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * Stare de eroare pentru un query eșuat, cu acțiune de reîncercare.
 * Afișează un mesaj prietenos; detaliile tehnice rămân în consolă.
 */
export function QueryError({
  error,
  onRetry,
  title = "Datele nu au putut fi încărcate",
  className,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  const message = friendlyError(error, "Încearcă din nou în câteva momente.");

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 text-center",
        compact ? "py-8" : "py-14",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="size-3.5" /> Reîncearcă
        </Button>
      ) : null}
    </div>
  );
}
