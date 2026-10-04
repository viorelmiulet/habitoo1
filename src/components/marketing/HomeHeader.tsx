import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu } from "lucide-react";
import { useEffect, useState } from "react";
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
import { CrmLink } from "./CrmLink";
import { publicNav } from "./public-nav";

export function HomeHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b transition-all duration-300",
        scrolled
          ? "border-border/70 bg-background/90 shadow-soft backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto grid h-20 w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        <Link
          to="/"
          className="w-fit rounded-full bg-background/95 px-4 py-2 shadow-soft"
          aria-label="Habitoo CRM — pagina principală"
        >
          <BrandLogo className="w-32 sm:w-36" priority />
        </Link>

        <nav aria-label="Navigare principală" className="hidden items-center gap-1 lg:flex">
          {publicNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                scrolled
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "text-navy-foreground hover:bg-surface/10 hover:text-surface",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center justify-end gap-2 lg:flex">
          <Button
            asChild
            variant="ghost"
            className={cn(
              "rounded-full",
              scrolled
                ? "text-foreground"
                : "text-navy-foreground hover:bg-surface/10 hover:text-surface",
            )}
          >
            <CrmLink to="/login">Autentificare</CrmLink>
          </Button>
          <Button asChild className="rounded-full px-5 shadow-raised">
            <CrmLink to="/register">
              Creează agenția <ArrowRight />
            </CrmLink>
          </Button>
        </div>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full border-gold/30 bg-background/95 lg:hidden"
              aria-label="Deschide meniul"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[88vw] max-w-sm bg-background p-6">
            <SheetHeader className="text-left">
              <SheetTitle className="sr-only">Meniu</SheetTitle>
              <SheetDescription className="sr-only">Navigare Habitoo CRM</SheetDescription>
              <Link
                to="/"
                onClick={() => setMenuOpen(false)}
                className="block w-36"
                aria-label="Habitoo CRM — pagina principală"
              >
                <BrandLogo />
              </Link>
            </SheetHeader>
            <nav aria-label="Navigare mobilă" className="mt-10 flex flex-col gap-2">
              {publicNav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold text-foreground hover:bg-muted"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 grid gap-3">
              <Button asChild className="h-12 rounded-full">
                <CrmLink to="/register" onClick={() => setMenuOpen(false)}>
                  Creează agenția <ArrowRight />
                </CrmLink>
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-full">
                <CrmLink to="/login" onClick={() => setMenuOpen(false)}>
                  Autentificare
                </CrmLink>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}