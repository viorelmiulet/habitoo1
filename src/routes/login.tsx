import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthRouteError } from "@/components/auth/AuthRouteError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { authErrorMessage, authKindMessage, classifyAuthError } from "@/lib/auth-errors";
import { rememberPostLoginRedirect } from "@/lib/auth-redirect";
import { safeInternalPath, authUrl } from "@/lib/host";
import { currentUserQueryKey } from "@/hooks/use-session";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  head: () => ({
    meta: [
      { title: "Autentificare — Habitoo CRM imobiliar" },
      {
        name: "description",
        content:
          "Intră în contul tău Habitoo și gestionează proprietățile, clienții și lead-urile agenției imobiliare.",
      },
      { property: "og:title", content: "Autentificare — Habitoo CRM imobiliar" },
      {
        property: "og:description",
        content:
          "Acces securizat pentru agenții imobiliare: portofoliu, clienți, lead-uri și rapoarte.",
      },
    ],
  }),
  component: LoginPage,
  errorComponent: AuthRouteError,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { redirect: requestedRedirect } = Route.useSearch();
  const target = safeInternalPath(requestedRedirect) ?? "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resending, setResending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const kind = classifyAuthError(error.message, error.code);
      setNeedsConfirm(kind === "email_not_confirmed");
      toast.error(authKindMessage(kind));
      return;
    }
    setNeedsConfirm(false);
    queryClient.removeQueries({ queryKey: currentUserQueryKey });
    if (!data.session) {
      toast.error("Sesiunea nu a putut fi inițializată. Încearcă din nou.");
      return;
    }
    await navigate({ to: target, replace: true });
  };

  const resend = async () => {
    if (!email) {
      toast.error("Completează adresa de email.");
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: authUrl("/auth/callback") },
    });
    setResending(false);
    if (error) {
      toast.error(authErrorMessage(error.message, error.code));
      return;
    }
    toast.success("Am retrimis emailul de confirmare. Verifică și folderul Spam.");
  };

  const google = async () => {
    rememberPostLoginRedirect(target);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: authUrl("/auth/callback"),
    });
    if (result.error) {
      toast.error(authErrorMessage(String(result.error)));
      return;
    }
    if (result.redirected) return;
    navigate({ to: target, replace: true });
  };

  return (
    <AuthShell
      title="Bine ai revenit"
      subtitle="Autentifică-te pentru a continua în CRM-ul agenției."
      footer={
        <>
          Nu ai cont?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Creează agenție
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nume@agentie.ro"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Parolă</Label>
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground hover:text-primary"
            >
              Ai uitat parola?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Se autentifică…" : "Autentificare"}
        </Button>
      </form>

      {needsConfirm ? (
        <div className="panel mt-4 space-y-3 p-4 text-sm">
          <p className="text-muted-foreground">
            Emailul nu este confirmat încă. Deschide linkul din mesajul primit sau cere unul nou.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={resend} disabled={resending}>
            {resending ? "Se trimite…" : "Retrimite emailul de confirmare"}
          </Button>
        </div>
      ) : null}

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> sau <span className="h-px flex-1 bg-border" />
      </div>

      <Button type="button" variant="outline" className="w-full gap-3" onClick={google}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.72A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
          />
        </svg>
        Continuă cu Google
      </Button>
    </AuthShell>
  );
}
