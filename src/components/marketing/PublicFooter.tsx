import { Link } from "@tanstack/react-router";
import { Facebook } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { openCookiePreferences } from "@/lib/cookie-consent";
import { FACEBOOK_URL } from "./structured-data";
import { GOOGLE_PROFILE_URL, LEGAL_NAME, COMPANY_TAX_ID, COMPANY_REGISTER_ID } from "./public-identity";
import { useEffect, useState } from "react";
import { footerColumns } from "./public-nav";
import { getHasPublicPartners } from "@/lib/public-partners.functions";

export function PublicFooter({ description = "CRM imobiliar pentru agențiile din România: proprietăți, clienți, cereri, lead-uri, matching automat, activități și rapoarte, într-o singură platformă." }: { description?: string }) {
  const year = new Date().getFullYear();
  // „Agenții partenere” apare doar când pagina e indexabilă (are cel puțin o agenție).
  const [hasPartners, setHasPartners] = useState(false);
  useEffect(() => {
    getHasPublicPartners().then(setHasPartners, () => setHasPartners(false));
  }, []);
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link to="/" className="block w-40" aria-label="Habitoo CRM — pagina principală">
              <BrandLogo />
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
            <p className="mt-4 max-w-md text-xs leading-relaxed text-muted-foreground">
              Habitoo CRM este operat de {LEGAL_NAME} · CUI {COMPANY_TAX_ID} · {COMPANY_REGISTER_ID}
            </p>
            <a href={GOOGLE_PROFILE_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-muted-foreground underline transition-colors hover:text-foreground">
              Lasă-ne o recenzie pe Google
            </a>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h3 className="font-sans text-xs font-semibold tracking-wider text-navy uppercase">
                  {col.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.filter((l) => l.to !== "/agentii" || hasPartners).map((l) => (
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
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={openCookiePreferences}
              className="underline transition-colors hover:text-foreground"
            >
              Preferințe cookie-uri
            </button>
            <p>Platformă multi-agenție, cu date izolate pentru fiecare agenție.</p>
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Habitoo pe Facebook"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Facebook className="size-4" aria-hidden />
            </a>
            <a href={GOOGLE_PROFILE_URL} target="_blank" rel="noopener noreferrer" aria-label="Habitoo pe Google" className="text-muted-foreground transition-colors hover:text-foreground">
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true"><path d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.58-4.12H3.08v2.59A10 10 0 0 0 12 22ZM6.42 13.92a6 6 0 0 1 0-3.84V7.49H3.08a10 10 0 0 0 0 9.02l3.34-2.59ZM12 5.96c1.47 0 2.79.51 3.82 1.52l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.92 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z"/></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
