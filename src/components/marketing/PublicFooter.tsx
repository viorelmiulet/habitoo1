import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { openCookiePreferences } from "@/lib/cookie-consent";
import { footerColumns } from "./public-nav";

export function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link
              to="/"
              className="block w-40"
              aria-label="Habitoo CRM — pagina principală"
            >
              <BrandLogo />
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              CRM imobiliar pentru agențiile din România: proprietăți, clienți, cereri, lead-uri,
              matching automat, activități și rapoarte, într-o singură platformă.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h3 className="font-sans text-xs font-semibold tracking-wider text-navy uppercase">
                  {col.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.to}>
                      <Link
                        to={l.to}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Habitoo CRM. Toate drepturile rezervate.</p>
          <p>Platformă multi-agenție, cu date izolate pentru fiecare agenție.</p>
        </div>
      </div>
    </footer>
  );
}
