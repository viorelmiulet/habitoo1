/** Setări → AI: creditele AI folosite/rămase luna aceasta și consumul pe tip de acțiune. */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyAiCredits } from "@/lib/ai/credits/credits.functions";
import { AI_CREDIT_ACTIONS, AI_CREDIT_ACTION_LABELS, aiCreditRatio, formatCreditReset } from "@/lib/ai/credits/credits";

export function useMyAiCredits() {
  const load = useServerFn(getMyAiCredits);
  return useQuery({ queryKey: ["ai-credits", "mine"], queryFn: () => load(), staleTime: 60_000 });
}

export function AiCreditsUsageCard() {
  const { data, isLoading } = useMyAiCredits();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Credite AI</CardTitle>
        <CardDescription>Bugetul lunar al agenției pentru funcțiile AI. Potrivirile, scorurile și ACP fără AI nu consumă credite.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Skeleton className="h-16 w-full" /> : !data ? (
          <p className="text-sm text-muted-foreground">Creditele AI nu au putut fi citite.</p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-foreground">{data.used} / {data.limit} credite folosite</span>
                <span className="text-muted-foreground">{Math.max(0, data.limit - data.used)} rămase · se resetează pe {formatCreditReset(data.resetOn)}</span>
              </div>
              <Progress value={aiCreditRatio(data) * 100} aria-label="Credite AI folosite luna aceasta" />
              {data.bonus > 0 ? <p className="text-xs text-muted-foreground">Include {data.bonus} credite bonus lunare.</p> : null}
            </div>
            <ul className="divide-y divide-border text-sm">
              {AI_CREDIT_ACTIONS.map((action) => (
                <li key={action} className="flex justify-between gap-3 py-2">
                  <span>{AI_CREDIT_ACTION_LABELS[action]}</span>
                  <span className="tabular-nums text-muted-foreground">{data.byAction[action] ?? 0}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
