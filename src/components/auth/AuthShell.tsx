import { Link } from "@tanstack/react-router";
import { Building2, CheckCircle2 } from "lucide-react";

const bullets = [
  "Portofoliu, clienți, cereri și lead-uri într-un singur loc",
  "Matching automat între proprietăți și cereri",
  "Rapoarte și obiective pentru management",
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hero-gradient hidden flex-col justify-between p-12 lg:flex">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </span>
          <span className="text-lg font-semibold">Habitoo CRM</span>
        </Link>
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-semibold tracking-tight">
            Tot ce are nevoie o agenție imobiliară, <span className="text-gradient">într-un singur loc</span>
          </h2>
          <ul className="space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">Platformă multi-agenție, cu izolare completă a datelor.</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Building2 className="size-5" />
              </span>
              Habitoo CRM
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
