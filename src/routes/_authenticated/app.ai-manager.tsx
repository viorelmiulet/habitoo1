/**
 * Habitoo Manager (Stage 17) — orchestratorul agenților Habitoo.
 *
 * Interfața nu atinge providerul AI: totul trece prin server functions, iar
 * orice acțiune care schimbă date trece prin aprobare umană.
 */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { AiFeatureGate } from "@/components/app/ai/AiFeatureGate";
import { ManagerAgentPanel } from "@/components/app/ManagerAgentPanel";

export const Route = createFileRoute("/_authenticated/app/ai-manager")({
  head: () => { const title = "Habitoo Manager — orchestrare agenți AI pentru agenția ta"; const description = 'Planuri coordonate pentru CRM, ACP și marketing, cu aprobare umană.'; const head = appHead(title); return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  component: GatedManagerAgentPage,
});

function ManagerAgentPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Habitoo Manager"
        description="Spune ce ai nevoie, iar managerul alege agenții potriviți: date CRM, analiză ACP și texte de marketing. Nimic nu se salvează fără aprobarea ta."
      />
      <ManagerAgentPanel />
    </div>
  );
}

/** Funcțiile AI sunt activate individual per agenție de administratorul platformei. */
function GatedManagerAgentPage() {
  return (
    <AiFeatureGate feature="ai_manager">
      <ManagerAgentPage />
    </AiFeatureGate>
  );
}
