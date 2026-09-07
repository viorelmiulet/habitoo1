import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthRouteError } from "@/components/auth/AuthRouteError";
import { Button } from "@/components/ui/button";
import { establishSessionFromLink, readAuthLinkParams } from "@/lib/auth-link";
import { takePostLoginRedirect } from "@/lib/auth-redirect";

/**
 * Rută publică de retur pentru autentificarea Google / linkurile din email
 * (confirmare cont, magic link). Tokenul din link are prioritate față de o
 * eventuală sesiune deja existentă în browser; apoi utilizatorul intră în
 * aplicație (unde /app decide între dashboard și onboarding).
 */
export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Finalizare autentificare — Habitoo CRM" },
      { name: "description", content: "Se finalizează autentificarea în contul tău Habitoo." },
      { property: "og:title", content: "Finalizare autentificare — Habitoo CRM" },
      { property: "og:description", content: "Se finalizează autentificarea în Habitoo." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallbackPage,
  errorComponent: AuthRouteError,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = readAuthLinkParams();
    const isRecovery = params.type === "recovery";

    void (async () => {
      const result = await establishSessionFromLink(params);
      if (cancelled) return;
      if (!result.ok) {
        setFailed(result.message);
        return;
      }
      if (isRecovery) {
        navigate({ to: "/reset-password", replace: true });
        return;
      }
      navigate({ to: takePostLoginRedirect() ?? "/app", replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!failed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Se finalizează autentificarea…
      </div>
    );
  }

  return (
    <AuthShell title="Autentificare neterminată" subtitle="Nu am putut confirma sesiunea.">
      <div className="panel p-5 text-sm text-muted-foreground">{failed}</div>
      <div className="mt-4 flex flex-col gap-2">
        <Button className="w-full" onClick={() => navigate({ to: "/login" })}>
          Înapoi la autentificare
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to="/forgot-password">Cere un link nou</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
