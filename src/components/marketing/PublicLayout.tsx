import type { ReactNode } from "react";
import { CookieConsent } from "./CookieConsent";
import { PublicFooter } from "./PublicFooter";
import { PublicHeader } from "./PublicHeader";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mk-root flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#continut"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-navy focus:px-3 focus:py-2 focus:text-sm focus:text-navy-foreground"
      >
        Sari la conținut
      </a>
      <PublicHeader />
      <main id="continut" className="flex-1">
        {children}
      </main>
      <PublicFooter />
      <CookieConsent />
    </div>
  );
}
