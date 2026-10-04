import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Building2,
  Eye,
  EyeOff,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { AuthRouteError } from "@/components/auth/AuthRouteError";
import { BrandLogo } from "@/components/brand/BrandLogo";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const kind = classifyAuthError(error.message, error.code);
      const message = authKindMessage(kind);
      setNeedsConfirm(kind === "email_not_confirmed");
      setFormError(message);
      toast.error(message);
      return;
    }
    setNeedsConfirm(false);
    setFormError(null);
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
    <main className="login-backdrop relative min-h-svh overflow-x-hidden bg-navy text-navy-foreground">
      <div className="absolute inset-0 bg-navy/75" aria-hidden="true" />
      <div className="relative mx-auto grid min-h-svh w-full max-w-[1440px] items-center gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:gap-16 lg:px-14 xl:gap-24 xl:px-20">
        <section className="mx-auto w-full max-w-xl pt-3 lg:mx-0 lg:pt-0" aria-labelledby="login-intro-title">
          <div className="hidden items-center gap-3 lg:flex">
            <span className="h-px w-12 bg-gold" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Habitoo CRM</span>
          </div>
          <h1 id="login-intro-title" className="font-display text-3xl leading-tight sm:text-4xl lg:mt-7 lg:text-6xl">
            <span className="block">Portofoliul tău, clienții tăi.</span>
            <span className="mt-1 block text-gold">Într-un singur loc.</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-navy-foreground/80 sm:text-base lg:mt-6 lg:text-lg lg:leading-8">
            Habitoo CRM ține anunțurile, clienții și portalurile agenției tale sincronizate.
          </p>

          <div className="mt-9 hidden h-px w-20 bg-gold lg:block" aria-hidden="true" />
          <div className="mt-6 hidden grid-cols-3 gap-3 lg:grid">
            {[
              { icon: Link2, label: "Portaluri integrate" },
              { icon: Sparkles, label: "Matching automat" },
              { icon: Building2, label: "Date separate pe agenții" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="login-feature flex min-h-24 flex-col justify-between p-4">
                <Icon className="size-5 text-gold" aria-hidden="true" />
                <span className="text-sm font-semibold leading-5 text-navy-foreground">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="login-card relative mx-auto w-full max-w-[520px] overflow-hidden bg-card p-6 text-card-foreground sm:p-9 lg:p-10" aria-labelledby="login-form-title">
          <div className="absolute inset-x-0 top-0 h-1 bg-gold" aria-hidden="true" />
          <Link to="/" className="mx-auto block w-fit" aria-label="Habitoo CRM — pagina principală">
            <BrandLogo className="w-40 sm:w-44" priority />
          </Link>

          <div className="mt-7 text-center sm:mt-8">
            <h2 id="login-form-title" className="text-2xl font-semibold sm:text-3xl">Conectează-te la contul tău</h2>
            <p className="mt-2 text-sm text-muted-foreground">Bine ai revenit în spațiul agenției tale.</p>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-5 sm:mt-8">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <span className="absolute left-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg bg-gold-tint text-gold-dark" aria-hidden="true">
                  <Mail className="size-4" />
                </span>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="nume@agentie.ro"
                  className="h-12 pl-12"
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? "login-error" : undefined}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="password">Parolă</Label>
                <Link to="/forgot-password" className="text-xs font-semibold text-gold-dark hover:underline">
                  Ai uitat parola?
                </Link>
              </div>
              <div className="relative">
                <span className="absolute left-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg bg-gold-tint text-gold-dark" aria-hidden="true">
                  <LockKeyhole className="size-4" />
                </span>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormError(null);
                  }}
                  className="h-12 pl-12 pr-12"
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? "login-error" : undefined}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Ascunde parola" : "Afișează parola"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
              {formError ? <p id="login-error" role="alert" className="text-sm font-semibold text-destructive">{formError}</p> : null}
            </div>
            <Button type="submit" className="h-12 w-full shadow-[0_8px_22px_color-mix(in_oklab,var(--gold)_22%,transparent)]" disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {loading ? "Se autentifică…" : "Conectare"}
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

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> sau <span className="h-px flex-1 bg-border" />
          </div>

          <Button type="button" variant="outline" className="h-12 w-full gap-3" onClick={google}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
            </svg>
            Continuă cu Google
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Nu ai cont?{" "}
            <Link to="/register" className="font-semibold text-gold-dark hover:underline">Creează agenție</Link>
          </p>
          <div className="mt-6 border-t border-border pt-5 text-center text-xs text-faint">© 2026 Habitoo CRM</div>
        </section>
      </div>
    </main>
  );
}
