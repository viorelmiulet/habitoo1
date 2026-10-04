import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { setCollaborationAutoEnabled } from "@/lib/collaboration.functions";
import { currentUserQueryKey } from "@/hooks/use-session";

/** Comutator „Activează colaborarea automat pe anunțuri”, salvat imediat (doar admin). */
export function CollaborationAutoSwitch({ initial }: { initial: boolean }) {
  const [checked, setChecked] = useState(initial);
  const save = useServerFn(setCollaborationAutoEnabled);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => save({ data: { enabled } }),
    onSuccess: (res, enabled) => {
      queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      toast.success(
        enabled
          ? `Colaborarea automată este pornită${res.activated ? ` (${res.activated} anunțuri activate)` : ""}.`
          : "Colaborarea automată este oprită pentru anunțurile noi.",
      );
    },
    onError: (e: Error, enabled) => {
      setChecked(!enabled);
      toastError(e);
    },
  });
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
      <div className="space-y-1">
        <Label htmlFor="collab_auto_enabled" className="text-sm">
          Activează colaborarea automat pe anunțuri
        </Label>
        <p className="text-xs text-muted-foreground">
          Anunțurile active devin vizibile pentru agențiile partenere. Agentul poate dezactiva
          colaborarea pe fiecare anunț.
        </p>
      </div>
      <Switch
        id="collab_auto_enabled"
        checked={checked}
        disabled={mutation.isPending}
        onCheckedChange={(v) => {
          setChecked(v);
          mutation.mutate(v);
        }}
      />
    </div>
  );
}
