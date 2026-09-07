import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthRouteError } from "@/components/auth/AuthRouteError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { establishSessionFromLink, readAuthLinkParams } from "@/lib/auth-link";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Setează o parolă nouă — Habitoo CRM" },
      {
        name: "description",
        content: "Alege o parolă nouă pentru contul tău Habitoo și revino în CRM-ul agenției.",
      },
      { property: "og:title", content: "Setează o parolă nouă — Habitoo CRM" },
      { property: "og:description", content: "Finalizează resetarea parolei contului Habitoo." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
  errorComponent: AuthRouteError,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Parametrii se citesc sincron, înainte de orice apel Supabase; sesiunea
    // veche din browser este înlocuită de tokenul din link.
    const params = readAuthLinkParams();
    void (async () => {
      const result = await establishSessionFromLink(params);
      if (cancelled) return;
      if (result.ok) {
        setReady(true);
        setLinkError(null);
      } else {
        setReady(false);
        setLinkError(result.message);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    toast.success("Parola a fost salvată.");
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
      {ready === null ? (
        <div className="panel p-5 text-sm text-muted-foreground">Se verifică linkul…</div>
      ) : ready === false ? (
        <div className="panel space-y-3 p-5 text-sm text-muted-foreground">
          <p>{linkError ?? "Linkul a expirat sau este invalid. Solicită unul nou."}</p>
          <Button asChild size="sm" variant="outline">
            <Link to="/forgot-password">Cere un link nou</Link>
          </Button>
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
