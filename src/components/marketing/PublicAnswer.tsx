import { useLocation } from "@tanstack/react-router";
import { answerForPath } from "@/lib/marketing/answer-content";
import { contentModified } from "@/lib/marketing/content-revisions";

export function PublicAnswer({ path: explicitPath }: { path?: string }) {
  const location = useLocation();
  const path = explicitPath ?? location.pathname.replace(/\/$/, "");
  const answer = answerForPath(path);
  const modified = contentModified(path);
  if (!answer || !modified) return null;
  return <div className="ds-answer mt-5 max-w-3xl space-y-2 p-4 text-base leading-relaxed text-foreground sm:p-5" data-public-answer>
    <p className="ds-eyebrow" aria-hidden>Pe scurt</p>
    <p><strong className="sr-only">Pe scurt: </strong>{answer}</p>
    <p className="font-mono text-xs ds-text-3">Actualizat: <time dateTime={modified}>{new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${modified}T12:00:00Z`))}</time></p>
  </div>;
}