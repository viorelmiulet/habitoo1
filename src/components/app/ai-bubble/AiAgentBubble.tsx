import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ListChecks, Sparkles } from "lucide-react";
import { LISTING_CHECK_EVENT } from "@/components/app/listing-check-event";

const PROPERTY_PAGE = /^\/app\/properties\/[0-9a-f-]{36}\/?$/i;

/** Bula plutitoare a Agentului AI: deschide același agent ca butonul din meniul lateral. */
export function AiAgentBubble() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  // Când agentul e deschis, bula se ascunde.
  if (pathname === "/app/ai" || pathname.startsWith("/app/ai/")) return null;
  const onProperty = PROPERTY_PAGE.test(pathname);
  return (
    <>
      {onProperty && menu ? (
        <div role="menu" className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] z-40 w-60 rounded-lg border border-border bg-popover p-1 text-sm shadow-lg md:right-4 md:bottom-32 lg:bottom-[4.25rem]">
          <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-muted"
            onClick={() => { setMenu(false); window.dispatchEvent(new CustomEvent(LISTING_CHECK_EVENT)); }}>
            <ListChecks className="size-4 text-ai" /> Verifică anunțul ăsta
          </button>
          <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-muted"
            onClick={() => { setMenu(false); navigate({ to: "/app/ai" }); }}>
            <Sparkles className="size-4 text-ai" /> Deschide Agentul AI
          </button>
        </div>
      ) : null}
      <button
        type="button"
        data-testid="ai-agent-bubble"
        aria-label="Deschide Agentul AI"
        onClick={() => (onProperty ? setMenu((m) => !m) : navigate({ to: "/app/ai" }))}
        className="ai-agent-bubble fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex size-14 items-center justify-center gap-2 rounded-full border text-sm font-medium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2 focus-visible:ring-offset-background md:right-4 md:bottom-20 md:size-auto md:h-11 md:px-4 lg:bottom-5"
      >
        <Sparkles aria-hidden className="size-5 text-ai md:size-4" />
        <span className="hidden md:inline">Agentul AI</span>
        <span aria-hidden className="ai-agent-bubble-dot hidden size-2 rounded-full bg-ai md:inline-block" />
      </button>
    </>
  );
}
