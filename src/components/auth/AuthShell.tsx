import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand/BrandLogo";

/**
 * Cadrul comun pentru ecranele din afara aplicației (autentificare, recuperare
 * cont, onboarding). Layout centrat: logo sus, card alb pentru conținut, fundal
 * în tonul deschis al aplicației.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  width = "sm",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** `md` pentru formulare mai lungi, ca cererea de înscriere. */
  width?: "sm" | "md";
}) {
  return (
    <div className="hero-gradient flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 sm:py-14">
      <div className={width === "md" ? "w-full max-w-xl" : "w-full max-w-md"}>
        <div className="flex justify-center">
          <Link to="/" className="block w-fit" aria-label="Habitoo CRM — pagina principală">
            <BrandLogo className="w-40" priority />
          </Link>
        </div>

        <div className="panel mt-8 p-6 sm:p-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="mt-7 text-left">{children}</div>
        </div>

        {footer ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
