import { useLocation, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

/** Bula plutitoare a Agentului AI: deschide același agent ca butonul din meniul lateral. */
export function AiAgentBubble() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Când agentul e deschis, bula se ascunde.
  if (pathname === "/app/ai" || pathname.startsWith("/app/ai/")) return null;
  return (
    <button
      type="button"
      data-testid="ai-agent-bubble"
      aria-label="Deschide Agentul AI"
      onClick={() => navigate({ to: "/app/ai" })}
      className="ai-agent-bubble fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex size-14 items-center justify-center gap-2 rounded-full border text-sm font-medium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2 focus-visible:ring-offset-background md:right-4 md:bottom-20 md:size-auto md:h-11 md:px-4 lg:bottom-5"
    >
      <Sparkles aria-hidden className="size-5 text-ai md:size-4" />
      <span className="hidden md:inline">Agentul AI</span>
      <span aria-hidden className="ai-agent-bubble-dot hidden size-2 rounded-full bg-ai md:inline-block" />
    </button>
  );
}
