/**
 * AI Marketing (Stage 16) — generarea de conținut pentru anunțuri și social
 * media, pornind strict de la datele proprietăților agenției.
 *
 * Interfața nu atinge providerul AI: totul trece prin server functions.
 */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { AiFeatureGate } from "@/components/app/ai/AiFeatureGate";
import { MarketingAgentPanel } from "@/components/app/MarketingAgentPanel";

export const Route = createFileRoute("/_authenticated/app/ai-marketing")({
  head: () => { const title = "AI Marketing — texte pentru anunțuri și social media"; const description = 'Pregătirea textelor pentru proprietăți și verificarea propunerilor AI Marketing.'; const head = appHead(title); return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  component: GatedMarketingAgentPage,
});

function MarketingAgentPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Marketing"
        description="Titluri, descrieri și postări generate din datele reale ale proprietăților. Nimic nu se salvează sau se publică fără aprobarea ta."
      />
      <MarketingAgentPanel allowPropertyPicker />
    </div>
  );
}

/** Funcțiile AI sunt activate individual per agenție de administratorul platformei. */
function GatedMarketingAgentPage() {
  return (
    <AiFeatureGate feature="ai_marketing">
      <MarketingAgentPage />
    </AiFeatureGate>
  );
}
