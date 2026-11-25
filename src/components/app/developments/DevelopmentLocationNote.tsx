import { Link } from "@tanstack/react-router";
import { inheritedLocationNote, incompleteDevelopmentNote, LINK_LOCATION_WARNING } from "@/lib/developments/unit-location";

/** Nota din Localizare pentru un anunț legat de un ansamblu. */
export function DevelopmentLocationNote({ development, inherits, linking = false }: { development: { id: string; name: string }; inherits: boolean; linking?: boolean }) {
  const name = development.name.trim();
  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3 text-sm" data-testid="development-location-note">
      <p>
        {inherits ? inheritedLocationNote(name) : incompleteDevelopmentNote(name)}{" "}
        <Link to="/app/developments/$id" params={{ id: development.id }} className="font-medium text-primary underline-offset-2 hover:underline">Deschide ansamblul</Link>
      </p>
      {inherits && linking ? <p className="font-medium text-warning-foreground">{LINK_LOCATION_WARNING}</p> : null}
    </div>
  );
}
