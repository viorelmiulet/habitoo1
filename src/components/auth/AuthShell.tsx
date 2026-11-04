import { Link } from "@tanstack/react-router";
import sidebarLogo from "@/assets/habitoo-sidebar-light.png.asset.json";
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
  progress,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** `md` pentru formulare mai lungi, ca cererea de înscriere. */
  width?: "sm" | "md";
  /** Progres opțional 0–1, afișat ca bară aurie în capul cardului. */
  progress?: number;
}) {
  return (
    <div className={width === "md" ? "hero-gradient flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 sm:py-14" : "login-backdrop relative flex min-h-svh flex-col items-center justify-center overflow-x-hidden bg-navy px-4 py-10 text-navy-foreground sm:py-14"}>
      {width === "md" ? null : <div className="absolute inset-0 bg-navy/75" aria-hidden="true" />}
      <div className={width === "md" ? "w-full max-w-[640px]" : "relative w-full max-w-md"}>
        <div className="flex justify-center">
          <Link to="/" className="block w-fit" aria-label="Habitoo CRM — pagina principală">
            {width === "md" ? <BrandLogo className="w-40" priority /> : <img src={sidebarLogo.url} alt="Habitoo CRM" className="block h-10 w-auto max-w-none object-contain" loading="eager" decoding="async" />}
          </Link>
        </div>

        <div className={width === "md" ? "mt-8 overflow-hidden rounded-[14px] border border-border bg-card p-4 sm:p-5" : "login-card mt-8 bg-card p-6 text-card-foreground sm:p-8"}>
          {typeof progress === "number" ? (
            <div className="-mx-4 -mt-4 mb-5 h-1.5 bg-muted sm:-mx-5 sm:-mt-5" aria-hidden>
              <div className="h-full bg-gold transition-[width]" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
            </div>
          ) : null}
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="mt-7 text-left">{children}</div>
        </div>

        {footer ? (
          <div className={width === "md" ? "mt-6 text-center text-sm text-muted-foreground" : "mt-6 text-center text-sm text-navy-foreground"}>{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
