import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Creează agenția — ImobiFlow CRM imobiliar" },
      {
        name: "description",
        content:
          "Deschide un cont de agenție în ImobiFlow: portofoliu, clienți, cereri, lead-uri și rapoarte în câteva minute.",
      },
      { property: "og:title", content: "Creează agenția — ImobiFlow CRM" },
      {
        property: "og:description",
        content: "Începe gratuit CRM-ul imobiliar pentru agenția ta din România.",
      },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", agency: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { full_name: form.fullName, agency_name: form.agency },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Cont creat. Confirmă adresa de email pentru a continua.");
      navigate({ to: "/login" });
      return;
    }
    navigate({ to: "/onboarding" });
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Autentificarea cu Google a eșuat.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/onboarding" });
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

      <Button type="button" variant="outline" className="w-full" onClick={google}>
        Continuă cu Google
      </Button>
    </AuthShell>
  );
}
