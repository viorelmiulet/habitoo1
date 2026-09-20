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
  head: () => appHead("Studio AI — imagini și video pentru proprietăți"),
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
