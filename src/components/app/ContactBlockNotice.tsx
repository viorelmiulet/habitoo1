import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Mesajul comun de blocare: agentul responsabil nu are telefon / anunțul nu are agent. */
export function ContactBlockNotice({
  message,
  isAdmin,
  className,
}: {
  message: string;
  isAdmin: boolean;
  className?: string;
}) {
  return (
    <p className={cn("text-xs font-semibold text-destructive", className)} role="note">
      {message}{" "}
      {isAdmin ? (
        <Link to="/app/team" className="underline">
          Deschide Echipa
        </Link>
      ) : (
        <Link to="/app/settings" search={{ tab: "profile" } as never} className="underline">
          Deschide profilul
        </Link>
      )}
    </p>
  );
}
