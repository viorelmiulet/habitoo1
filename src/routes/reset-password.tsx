import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Setează o parolă nouă — ImobiFlow CRM" },
      {
        name: "description",
        content: "Alege o parolă nouă pentru contul tău ImobiFlow și revino în CRM-ul agenției.",
      },
      { property: "og:title", content: "Setează o parolă nouă — ImobiFlow CRM" },
      { property: "og:description", content: "Finalizează resetarea parolei contului ImobiFlow." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setReady((prev) => prev ?? Boolean(data.session));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Parolele nu coincid.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(authErrorMessage(error.message, error.code));
      return;
    }
    toast.success("Parola a fost schimbată. Te poți autentifica.");
    navigate({ to: "/app", replace: true });
  };

  return (
    <AuthShell
      title="Parolă nouă"
      subtitle="Alege o parolă nouă pentru contul tău."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Înapoi la autentificare
        </Link>
      }
    >
      {ready === false ? (
        <div className="panel p-5 text-sm text-muted-foreground">
          Linkul de resetare este expirat sau incomplet. Cere un link nou din pagina{" "}
          <Link to="/forgot-password" className="font-medium text-primary hover:underline">
            Ai uitat parola
          </Link>
          .
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Parolă nouă</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minim 8 caractere.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmă parola</Label>
            <Input
              id="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Se salvează…" : "Salvează parola"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
