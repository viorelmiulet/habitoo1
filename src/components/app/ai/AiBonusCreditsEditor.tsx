/** SuperAdmin → agenție: credite AI bonus adăugate lunar peste plan. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { getOrganizationAiCredits, setOrganizationBonusCredits } from "@/lib/ai/credits/credits.functions";

export function AiBonusCreditsEditor({ organizationId }: { organizationId: string }) {
  const load = useServerFn(getOrganizationAiCredits);
  const save = useServerFn(setOrganizationBonusCredits);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["superadmin", "ai-credits", organizationId], queryFn: () => load({ data: { organizationId } }) });
  const [bonus, setBonus] = useState<number>(0);
  useEffect(() => { if (query.data) setBonus(query.data.bonus); }, [query.data]);
  const mutation = useMutation({
    mutationFn: () => save({ data: { organizationId, bonus } }),
    onSuccess: () => {
      toast.success("Creditele bonus au fost salvate.");
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "ai-credits", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "ai-credit-usage"] });
    },
    onError: (error: unknown) => toastError(error),
  });
  const id = `ai-bonus-${organizationId}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Credite AI bonus (lunar, peste plan)</Label>
      {query.data ? <p className="text-xs text-muted-foreground">Luna aceasta: {query.data.used}/{query.data.limit} credite folosite.</p> : null}
      <div className="flex gap-2">
        <Input id={id} type="number" min={0} step={1} className="max-w-40" value={bonus} onChange={(e) => setBonus(e.target.valueAsNumber)} />
        <Button variant="outline" disabled={mutation.isPending || !Number.isInteger(bonus) || bonus < 0} onClick={() => mutation.mutate()}>Salvează</Button>
      </div>
    </div>
  );
}
