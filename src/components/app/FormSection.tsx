/**
 * Bloc de formular: titlu consecvent, descriere opțională și spațiere generoasă.
 * Prezentare doar — folosit de formularele de adăugare/editare a proprietății.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel p-6", className)}>
      <header className="mb-5">
        <h2 className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </header>
      <div className="space-y-5">{children}</div>
    </section>
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
