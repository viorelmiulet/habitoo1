import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { setPlatformUserPublicProfileHidden } from "@/lib/superadmin-users.functions";

/** Comutator SuperAdmin „Ascunde profilul public”; ofertele agentului rămân publicate. */
export function PublicProfileHiddenToggle({ userId, hidden }: { userId: string; hidden: boolean }) {
  const queryClient = useQueryClient();
  const setHidden = useServerFn(setPlatformUserPublicProfileHidden);
  const run = useMutation({
    mutationFn: (next: boolean) => setHidden({ data: { userId, hidden: next } }),
    onSuccess: (_r, next) => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] });
      toast.success(next ? "Profilul public a fost ascuns." : "Profilul public este din nou vizibil.");
    },
    onError: (e: Error) => toastError(e),
  });
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm">
        <span className="font-medium text-foreground">Ascunde profilul public</span>
        <span className="block text-xs text-muted-foreground">Numele și poza agentului nu apar pe site; pe oferte apare agenția.</span>
      </span>
      <Switch checked={hidden} disabled={run.isPending} onCheckedChange={(v) => run.mutate(v)} aria-label="Ascunde profilul public" />
    </label>
  );
}
