import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PromptRequest = {
  title: string;
  description?: ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  /** Returnează mesaj de eroare dacă valoarea nu e validă. */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void | Promise<unknown>;
};

/**
 * Înlocuitor stilizat pentru `window.prompt`. Se controlează printr-un obiect
 * `request` (null = închis), astfel încât apelanții pot deschide dialogul
 * dintr-un handler sincron: `setPrompt({ title, onSubmit })`.
 */
export function PromptDialog({
  request,
  onClose,
}: {
  request: PromptRequest | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (request) {
      setValue(request.defaultValue ?? "");
      setError(null);
      setPending(false);
    }
  }, [request]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request) return;
    const trimmed = value.trim();
    const validation = request.validate ? request.validate(trimmed) : trimmed ? null : "Completează acest câmp.";
    if (validation) {
      setError(validation);
      return;
    }
    try {
      setPending(true);
      await request.onSubmit(trimmed);
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={Boolean(request)} onOpenChange={(v) => (!v && !pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{request?.title}</DialogTitle>
            {request?.description ? <DialogDescription>{request.description}</DialogDescription> : null}
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="prompt-value">{request?.label ?? "Valoare"}</Label>
            <Input
              id="prompt-value"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder={request?.placeholder}
              autoFocus
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "prompt-error" : undefined}
            />
            {error ? (
              <p id="prompt-error" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Renunță
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Se salvează…" : (request?.confirmLabel ?? "Salvează")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
