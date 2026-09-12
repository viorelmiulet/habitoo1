import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthRouteError } from "@/components/auth/AuthRouteError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { authErrorMessage } from "@/lib/auth-errors";
import { authUrl } from "@/lib/host";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Creează agenția — Habitoo CRM imobiliar" },
      {
        name: "description",
        content:
          "Deschide un cont de agenție în Habitoo: portofoliu, clienți, cereri, lead-uri și rapoarte în câteva minute.",
      },
      { property: "og:title", content: "Creează agenția — Habitoo CRM" },
      {
        property: "og:description",
        content: "Începe gratuit CRM-ul imobiliar pentru agenția ta din România.",
      },
    ],
  }),
  component: RegisterPage,
  errorComponent: AuthRouteError,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    agency: "",
    phone: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: authUrl("/auth/callback"),
        data: { full_name: form.fullName, agency_name: form.agency, phone: form.phone },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(authErrorMessage(error.message, error.code));
      return;
    }
    // Supabase nu dezvăluie conturile existente: întoarce user fără identități.
    const existingAccount = Boolean(data.user && (data.user.identities?.length ?? 0) === 0);
    if (existingAccount) {
      setNotice(
        "Există deja un cont cu acest email. Autentifică-te cu parola, cu Google sau resetează parola.",
      );
      toast.error("Există deja un cont cu acest email.");
      return;
    }
    if (!data.session) {
      setNotice(
        `Cont creat. Verifică emailul ${form.email} pentru linkul de confirmare (verifică și folderul Spam). Poți retrimite mesajul din pagina de autentificare.`,
      );
      toast.success("Cont creat. Verifică emailul pentru confirmare.");
      return;
    }
    navigate({ to: "/onboarding" });
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: authUrl("/auth/callback"),
    });
    if (result.error) {
      toast.error(authErrorMessage(String(result.error)));
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/app" });
  };

  return (
    <AuthShell
      title="Creează-ți agenția"
      subtitle="Contul tău devine automat administrator al agenției."
      footer={
        <>
          Ai deja cont?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Autentifică-te
          </Link>
        </>
      }
    >
      {notice ? <div className="panel mb-4 p-4 text-sm text-muted-foreground">{notice}</div> : null}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Nume complet</Label>
          <Input id="fullName" required value={form.fullName} onChange={set("fullName")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agency">Numele agenției</Label>
          <Input id="agency" required value={form.agency} onChange={set("agency")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefon</Label>
          <Input
            id="phone"
            type="tel"
            required
            value={form.phone}
            onChange={set("phone")}
            placeholder="07xx xxx xxx"
            autoComplete="tel"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email de lucru</Label>
          <Input id="email" type="email" required value={form.email} onChange={set("email")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Parolă</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
          />
          <p className="text-xs text-muted-foreground">Minim 8 caractere.</p>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Se creează contul…" : "Creează cont"}
        </Button>
      </form>

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
