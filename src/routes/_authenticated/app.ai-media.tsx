/**
 * Studio AI — generare de imagini și scurte videoclipuri pentru proprietăți și
 * materiale de marketing. Generarea rulează pe server; nimic nu se publică
 * automat.
 */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { AiFeatureGate } from "@/components/app/ai/AiFeatureGate";
import { AiMediaPanel } from "@/components/app/AiMediaPanel";

export const Route = createFileRoute("/_authenticated/app/ai-media")({
  head: () => {
    const title = "Studio AI — imagini și video pentru proprietăți | Habitoo CRM";
    const description = "Studio AI privat pentru îmbunătățirea fotografiilor, generarea imaginilor de marketing și videoclipuri pentru proprietăți.";
    const head = appHead(title);
    return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  component: GatedAiMediaPage,
});

function AiMediaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Studio AI"
        description="Îmbunătățește fotografiile proprietăților, creează un scurt video de prezentare dintr-o poză sau generează imagini pentru materiale de marketing."
      />
      <AiMediaPanel />
    </div>
  );
}

/** Funcțiile AI sunt activate individual per agenție de administratorul platformei. */
function GatedAiMediaPage() {
  return (
    <AiFeatureGate feature="ai_media">
      <AiMediaPage />
    </AiFeatureGate>
  );
}
