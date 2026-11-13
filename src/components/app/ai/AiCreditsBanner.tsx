/** Banner pentru adminul agenției când consumul de credite AI atinge 80%. */
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCreditReset, shouldWarnAiCredits } from "@/lib/ai/credits/credits";
import { useMyAiCredits } from "./AiCreditsUsageCard";

export function AiCreditsBanner() {
  const { data } = useMyAiCredits();
  if (!data || !shouldWarnAiCredits(data)) return null;
  const exhausted = data.used >= data.limit;
  return (
    <Alert className="mb-4" role="status">
      <AlertTitle>{exhausted ? "Creditele AI ale lunii s-au terminat" : "Ai folosit peste 80% din creditele AI"}</AlertTitle>
      <AlertDescription>
        {data.used}/{data.limit} credite folosite luna aceasta. Se resetează pe {formatCreditReset(data.resetOn)}. Poți solicita credite suplimentare administratorului platformei.{" "}
        <Link to="/app/settings" search={{ tab: "ai" } as never} className="font-medium underline">Vezi consumul</Link>
      </AlertDescription>
    </Alert>
  );
}
