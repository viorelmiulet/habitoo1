import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Rută publică de retur pentru autentificarea Google / linkurile din email.
 * Așteaptă hidratarea sesiunii, apoi trimite utilizatorul în aplicație
 * (unde /app decide singur între dashboard și onboarding).
 */
export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Finalizare autentificare — ImobiFlow CRM" },
      { name: "description", content: "Se finalizează autentificarea în contul tău ImobiFlow." },
      { property: "og:title", content: "Finalizare autentificare — ImobiFlow CRM" },
      { property: "og:description", content: "Se finalizează autentificarea în ImobiFlow." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigate({ to: "/app", replace: true });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        finish();
        return;
      }
      // Sesiunea poate sosi cu întârziere după redirectul providerului.
      window.setTimeout(async () => {
        const { data: retry } = await supabase.auth.getSession();
        if (retry.session) finish();
        else if (!done) setFailed(true);
      }, 3000);
    })();

    return () => sub.subscription.unsubscribe();
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
      <p className="text-sm text-muted-foreground">
        Încearcă din nou autentificarea. Dacă folosești Google, permite ferestrele pop-up pentru acest
        site.
      </p>
      <Button className="mt-4 w-full" onClick={() => navigate({ to: "/login" })}>
        Înapoi la autentificare
      </Button>
    </AuthShell>
  );
}
