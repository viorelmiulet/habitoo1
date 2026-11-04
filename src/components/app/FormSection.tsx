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
    <section className={cn("min-w-0 overflow-hidden rounded-[14px] border border-border bg-card text-[15px] [&_input]:rounded-[10px] [&_textarea]:rounded-[10px] [&_button[role=combobox]]:rounded-[10px]", className)}>
      <header className="flex min-w-0 items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 className="font-sans text-base font-bold text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Rând compact: eticheta în stânga (aliniată la dreapta), câmpul în dreapta; pe telefon, una sub alta. */
export function FormRow({ label, htmlFor, children, labelClassName, compact }: { label: ReactNode; htmlFor?: string; children: ReactNode; labelClassName?: string; /** Etichetă ~140px și câmp de maximum ~240px, pentru valori scurte. */ compact?: boolean }) {
  return (
    <div className={cn("grid min-h-9 min-w-0 grid-cols-1 items-center gap-x-3 gap-y-1", compact ? "sm:grid-cols-[140px_minmax(0,240px)]" : "sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
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
