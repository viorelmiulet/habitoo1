import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu } from "lucide-react";
import { useState } from "react";
import sidebarLogo from "@/assets/habitoo-sidebar-light.png.asset.json";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { publicNav } from "./public-nav";
import { CrmLink } from "./CrmLink";

export const navyButton =
  "bg-navy text-navy-foreground shadow-raised hover:bg-navy/90 focus-visible:ring-navy";

export function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-navy-foreground/15 bg-navy">
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 sm:px-6 lg:h-[72px] lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        <Link
          to="/"
          className="flex h-full w-fit items-center"
          aria-label="Habitoo CRM — pagina principală"
        >
          <img
            src={sidebarLogo.url}
            alt="Habitoo CRM"
            className="block h-8 w-auto max-w-none object-contain lg:h-10"
            loading="eager"
            decoding="async"
          />
        </Link>

        <nav aria-label="Navigare principală" className="hidden items-center gap-1 lg:flex">
          {publicNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-full px-4 py-2 text-[15px] font-semibold text-navy-foreground transition-colors hover:bg-surface/10 hover:text-surface"
              activeProps={{ className: "bg-surface/10 text-surface" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center justify-end gap-2 lg:flex">
          <Button asChild variant="ghost" className="h-10 rounded-full px-[18px] text-[15px] text-surface hover:bg-surface/10 hover:text-surface">
            <CrmLink to="/login">Autentificare</CrmLink>
          </Button>
          <Button asChild className="h-10 rounded-full bg-gold px-[18px] text-[15px] font-semibold text-navy shadow-raised hover:bg-gold/90">
            <CrmLink to="/register">
              Creează agenția <ArrowRight />
            </CrmLink>
          </Button>
        </div>

        <div className="flex items-center justify-end gap-2 lg:hidden">
          <Button asChild variant="ghost" size="sm" className="hidden h-10 rounded-full text-surface hover:bg-surface/10 hover:text-surface sm:inline-flex">
            <CrmLink to="/login">Autentificare</CrmLink>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="size-11 rounded-full border-navy-foreground/25 bg-navy text-navy-foreground hover:bg-surface/10 hover:text-surface" aria-label="Deschide meniul">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-sm bg-background p-6">
              <SheetHeader className="text-left">
                <SheetTitle className="sr-only">Meniu</SheetTitle>
                <SheetDescription className="sr-only">Navigare Habitoo CRM</SheetDescription>
                <Link
                  to="/"
                  onClick={() => setOpen(false)}
                  className="block w-36"
                  aria-label="Habitoo CRM — pagina principală"
                >
                  <BrandLogo className="h-8 w-auto max-w-none" />
                </Link>
              </SheetHeader>
              <nav aria-label="Navigare mobilă" className="mt-10 flex flex-col gap-2">
                {publicNav.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold text-foreground hover:bg-muted"
                    activeProps={{ className: "bg-muted" }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-8 grid gap-3">
                <Button asChild className="h-12 rounded-full">
                  <CrmLink to="/register" onClick={() => setOpen(false)}>
                    Creează agenția <ArrowRight />
                  </CrmLink>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-full">
                  <CrmLink to="/login" onClick={() => setOpen(false)}>
                    Autentificare
                  </CrmLink>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
