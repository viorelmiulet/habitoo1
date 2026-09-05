import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { authErrorMessage, authKindMessage, classifyAuthError } from "@/lib/auth-errors";
import { rememberPostLoginRedirect } from "@/lib/auth-redirect";
import { safeInternalPath } from "@/lib/host";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
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
        content: "Acces securizat pentru agenții imobiliare: portofoliu, clienți, lead-uri și rapoarte.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const kind = classifyAuthError(error.message, error.code);
      setNeedsConfirm(kind === "email_not_confirmed");
      toast.error(authKindMessage(kind));
      return;
    }
    setNeedsConfirm(false);
    navigate({ to: target, replace: true });
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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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
      redirect_uri: `${window.location.origin}/auth/callback`,
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
            <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
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

      <Button type="button" variant="outline" className="w-full" onClick={google}>
        Continuă cu Google
      </Button>
    </AuthShell>
  );
}
