import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu } from "lucide-react";
import { useState } from "react";
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
import { cn } from "@/lib/utils";
import { publicNav } from "./public-nav";
import { CrmLink } from "./CrmLink";

export const navyButton =
  "bg-navy text-navy-foreground shadow-raised hover:bg-navy/90 focus-visible:ring-navy";

export function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <Link
          to="/"
          className="block w-32 shrink-0 sm:w-36 lg:w-40"
          aria-label="Habitoo CRM — pagina principală"
        >
          <BrandLogo priority />
        </Link>

        <nav aria-label="Navigare principală" className="hidden items-center gap-1 lg:flex">
          {publicNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              activeProps={{ className: "text-navy font-semibold" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button asChild variant="ghost" size="sm">
            <CrmLink to="/login">Autentificare</CrmLink>
          </Button>
          <Button asChild size="sm" className={navyButton}>
            <CrmLink to="/register">
              Creează agenția <ArrowRight />
            </CrmLink>
          </Button>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <CrmLink to="/login">Autentificare</CrmLink>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Deschide meniul">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-sm">
              <SheetHeader className="text-left">
                <SheetTitle className="sr-only">Meniu</SheetTitle>
                <SheetDescription className="sr-only">Navigare Habitoo CRM</SheetDescription>
                <Link
                  to="/"
                  onClick={() => setOpen(false)}
                  className="block w-36"
                  aria-label="Habitoo CRM — pagina principală"
                >
                  <BrandLogo />
                </Link>
              </SheetHeader>
              <nav aria-label="Navigare mobilă" className="mt-8 flex flex-col gap-1">
                {publicNav.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
                    activeProps={{ className: "bg-muted text-navy" }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-8 flex flex-col gap-2">
                <Button asChild className={cn(navyButton, "h-11")}>
                  <CrmLink to="/register" onClick={() => setOpen(false)}>
                    Creează agenția <ArrowRight />
                  </CrmLink>
                </Button>
                <Button asChild variant="outline" className="h-11">
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
