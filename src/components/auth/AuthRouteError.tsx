import { Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";

/**
 * Error boundary pentru rutele de autentificare: un token invalid sau o excepție
 * neașteptată afișează un mesaj lizibil, nu o pagină albă.
 */
export function AuthRouteError({ error }: { error?: Error }) {
  if (error) console.error(error);

  return (
    <AuthShell
      title="Linkul nu a putut fi deschis"
      subtitle="A apărut o problemă la autentificare."
    >
      <div className="panel p-5 text-sm text-muted-foreground">
        Linkul a expirat sau este invalid. Solicită unul nou.
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button asChild className="w-full">
          <Link to="/forgot-password">Cere un link nou</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Înapoi la autentificare</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
