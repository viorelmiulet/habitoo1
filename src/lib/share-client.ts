import { toast } from "@/components/ui/sonner";
import { logAudit } from "@/lib/crm";
import { useCurrentUser } from "@/hooks/use-session";

export const SHARE_COPY_TOAST = "Textul e copiat — lipește-l în descriere";

/** Jurnalul de activitate al proprietății: „Distribuit pe <rețea>” sau „Distribuit din telefon”. */
export function useShareLogger(propertyId: string) {
  const { data: user } = useCurrentUser();
  return (action: string) =>
    void logAudit({ organizationId: user?.organization?.id, actorId: user?.userId, action, entity: "property", entityId: propertyId });
}

/**
 * Deschide meniul de partajare al telefonului. Textul se copiază înainte, fără await,
 * ca să nu se piardă gestul utilizatorului (Instagram/TikTok ignoră textul trimis).
 */
export async function shareFilesFromPhone(files: File[], text: string, onShared: () => void) {
  if (text.trim()) {
    void navigator.clipboard?.writeText(text).then(() => toast.success(SHARE_COPY_TOAST)).catch(() => undefined);
  }
  try {
    await navigator.share({ files, text: text.trim() || undefined });
    onShared();
  } catch (e) {
    if ((e as DOMException).name !== "AbortError") toast.error("Distribuirea nu a funcționat. Descarcă fișierul și postează-l manual.");
  }
}
