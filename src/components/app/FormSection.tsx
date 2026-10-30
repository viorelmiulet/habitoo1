/**
 * Panou de formular: chenar subțire, titlu pe fundal gri foarte deschis, fără umbre.
 * Prezentare doar — folosit de formularele de adăugare/editare a proprietății.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FormSection({
  title,
  description,
  children,
  className,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-[4px] border border-border bg-card text-[15px]", className)}>
      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border bg-muted/60 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="font-sans text-[15px] font-medium text-foreground">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

/** Rând compact: eticheta în stânga (aliniată la dreapta), câmpul în dreapta; pe telefon, una sub alta. */
export function FormRow({ label, htmlFor, children, labelClassName }: { label: ReactNode; htmlFor?: string; children: ReactNode; labelClassName?: string }) {
  return (
    <div className="grid min-h-9 min-w-0 grid-cols-1 items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <label htmlFor={htmlFor} className={cn("min-w-0 text-[15px] text-foreground sm:text-right", labelClassName)}>{label}</label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Marcaj consecvent pentru câmpurile obligatorii. */
export function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      {" *"}
    </span>
  );
}
