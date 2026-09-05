import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Resetare parolă — ImobiFlow CRM" },
      {
        name: "description",
        content: "Primești pe email un link pentru resetarea parolei contului tău ImobiFlow.",
      },
      { property: "og:title", content: "Resetare parolă — ImobiFlow CRM" },
      { property: "og:description", content: "Recuperează accesul la contul agenției tale." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthShell
      title="Resetare parolă"
      subtitle="Îți trimitem un link de resetare pe email."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Înapoi la autentificare
        </Link>
      }
    >
      {sent ? (
        <div className="panel p-5 text-sm">
          Am trimis instrucțiunile la <span className="font-medium">{email}</span>. Verifică și folderul
          Spam.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">
            Trimite link de resetare
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
