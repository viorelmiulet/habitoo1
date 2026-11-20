import { Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";

/** Marcaj „Ansamblu: {nume}” cu aceeași iconiță ca meniul Ansambluri. */
export function DevelopmentBadge({ id, name }: { id: string; name: string | null | undefined }) {
  return (
    <Link
      to="/app/developments/$id"
      params={{ id }}
      data-testid="development-badge"
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
    >
      <Layers className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">Ansamblu: {name || "—"}</span>
    </Link>
  );
}
