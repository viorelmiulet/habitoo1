import { Clock, ShieldOff } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ORG_BLOCKED_MESSAGES, type OrgBlockReason } from "@/lib/org-access";

/** Ecran dedicat pentru membrii unei agenții suspendate, anulate sau arhivate. */
export function OrgBlocked({ reason }: { reason: OrgBlockReason }) {
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel max-w-md space-y-4 p-8 text-center">
        {reason === "pending_approval" ? (
          <Clock className="mx-auto size-10 text-primary" />
        ) : (
          <ShieldOff className="mx-auto size-10 text-muted-foreground" />
        )}
        <h1 className="text-lg font-semibold">
          {reason === "pending_approval"
            ? "Agenție în așteptarea aprobării"
            : reason === "archived"
            ? "Agenție arhivată"
            : reason === "cancelled"
              ? "Agenție anulată"
              : "Agenție suspendată"}
        </h1>
        <p className="text-sm text-muted-foreground">{ORG_BLOCKED_MESSAGES[reason]}</p>
        <Button variant="outline" onClick={signOut}>
          Deconectare
        </Button>
      </div>
    </div>
  );
}
