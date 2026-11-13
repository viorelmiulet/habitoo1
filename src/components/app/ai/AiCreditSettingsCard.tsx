/** SuperAdmin → Funcții AI → „Credite”: credite lunare pe plan, costuri pe acțiune și consumul pe agenție. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineLoading } from "@/components/app/LoadingState";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import {
  AI_CREDIT_ACTIONS,
  AI_CREDIT_ACTION_LABELS,
  AI_CREDIT_PLANS,
  AI_CREDIT_PLAN_LABELS,
} from "@/lib/ai/credits/credits";
import {
  getAiCreditSettings,
  listAiCreditUsage,
  saveAiCreditSettings,
  type AiCreditSettings,
} from "@/lib/ai/credits/credits.functions";

export function AiCreditSettingsCard() {
  const load = useServerFn(getAiCreditSettings);
  const save = useServerFn(saveAiCreditSettings);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["superadmin", "ai-credit-settings"], queryFn: () => load() });
  const [draft, setDraft] = useState<AiCreditSettings | null>(null);
  useEffect(() => { if (query.data) setDraft(query.data); }, [query.data]);
  const mutation = useMutation({
    mutationFn: (value: AiCreditSettings) => save({ data: value }),
    onSuccess: () => {
      toast.success("Creditele AI au fost salvate.");
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "ai-credit-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "ai-credit-usage"] });
    },
    onError: (error: unknown) => toastError(error),
  });
  const valid = draft !== null && [...Object.values(draft.plans), ...Object.values(draft.costs)].every((v) => Number.isInteger(v) && v >= 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credite</CardTitle>
        <CardDescription>Credite AI lunare pe plan (și pentru agențiile în probă) și costul fiecărei acțiuni. Luna se resetează pe 1, ora României.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!draft ? <InlineLoading label="Se încarcă setările…" /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {AI_CREDIT_PLANS.map((plan) => (
                <div key={plan} className="space-y-2">
                  <Label htmlFor={`credit-plan-${plan}`}>Plan {AI_CREDIT_PLAN_LABELS[plan]} (credite/lună)</Label>
                  <Input id={`credit-plan-${plan}`} type="number" min={0} step={1} value={draft.plans[plan]} onChange={(e) => setDraft({ ...draft, plans: { ...draft.plans, [plan]: e.target.valueAsNumber } })} />
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {AI_CREDIT_ACTIONS.map((action) => (
                <div key={action} className="space-y-2">
                  <Label htmlFor={`credit-cost-${action}`}>{AI_CREDIT_ACTION_LABELS[action]}</Label>
                  <Input id={`credit-cost-${action}`} type="number" min={0} step={1} value={draft.costs[action]} onChange={(e) => setDraft({ ...draft, costs: { ...draft.costs, [action]: e.target.valueAsNumber } })} />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Textul AI se taxează pe apel. Scanarea actelor de identitate din Contracte nu consumă credite.</p>
            <Button disabled={!valid || mutation.isPending} onClick={() => draft && mutation.mutate(draft)}>Salvează creditele</Button>
          </>
        )}
        <AiCreditUsageTable />
      </CardContent>
    </Card>
  );
}

function AiCreditUsageTable() {
  const load = useServerFn(listAiCreditUsage);
  const query = useQuery({ queryKey: ["superadmin", "ai-credit-usage"], queryFn: () => load() });
  if (query.isLoading) return <InlineLoading label="Se încarcă consumul…" />;
  const rows = query.data ?? [];
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm font-semibold">Consum pe agenție — luna curentă</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Agenție</TableHead><TableHead>Plan</TableHead><TableHead className="text-right">Bonus</TableHead><TableHead className="text-right">Folosite</TableHead><TableHead className="text-right">Buget</TableHead><TableHead className="text-right">%</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.organizationId}>
                <TableCell>{row.organizationName}</TableCell>
                <TableCell>{AI_CREDIT_PLAN_LABELS[row.plan as keyof typeof AI_CREDIT_PLAN_LABELS] ?? row.plan}</TableCell>
                <TableCell className="text-right tabular-nums">{row.bonus}</TableCell>
                <TableCell className="text-right tabular-nums">{row.used}</TableCell>
                <TableCell className="text-right tabular-nums">{row.limit}</TableCell>
                <TableCell className="text-right tabular-nums">{row.limit > 0 ? Math.round((row.used / row.limit) * 100) : 0}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
