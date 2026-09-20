/**
 * Studio AI — generare de imagini și scurte videoclipuri pentru proprietăți și
 * materiale de marketing. Generarea rulează pe server; nimic nu se publică
 * automat.
 */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { AiMediaPanel } from "@/components/app/AiMediaPanel";

export const Route = createFileRoute("/_authenticated/app/ai-media")({
  head: () => appHead("Studio AI — imagini și video pentru proprietăți"),
  component: AiMediaPage,
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
