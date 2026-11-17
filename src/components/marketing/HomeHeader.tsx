import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import darkLogo from "@/assets/brand/habitoo-logo-dark.png.asset.json";
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
        "fixed inset-x-0 top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md transition-all duration-300",
        scrolled ? "h-16 shadow-soft" : "h-16 lg:h-[72px]",
      )}
    >
      <div className="mx-auto grid h-full w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        <Link
          to="/"
          className="flex h-full w-fit items-center"
          aria-label="Habitoo CRM — pagina principală"
        >
          <img
            src={darkLogo.url}
            alt="Habitoo CRM"
            width={85}
            height={40}
            className="block h-9 w-auto max-w-none object-contain lg:h-10"
            loading="eager"
            decoding="async"
          />
          <span className="ml-3 hidden rounded-md border border-[color:var(--ds-line-strong)] px-1.5 py-0.5 font-mono text-[10px] tracking-wider ds-ai sm:inline">AI CRM</span>
        </Link>

        <nav aria-label="Navigare principală" className="hidden items-center gap-1 lg:flex">
          {publicNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-lg px-3 py-2 text-[15px] font-medium text-navy-foreground transition-colors hover:bg-surface/10 hover:text-surface",
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
            className="h-10 rounded-full px-[18px] text-[15px] text-surface hover:bg-surface/10 hover:text-surface"
          >
            <CrmLink to="/login">Autentificare</CrmLink>
          </Button>
          <Button asChild className="ds-btn ds-btn-primary h-11 px-[18px]">
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
              className="size-11 rounded-full border-[color:var(--ds-line-strong)] bg-transparent text-navy-foreground hover:bg-surface/10 hover:text-surface lg:hidden"
              aria-label="Deschide meniul"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="mk-root w-[88vw] max-w-sm border-border p-6">
            <SheetHeader className="text-left">
              <SheetTitle className="sr-only">Meniu</SheetTitle>
              <SheetDescription className="sr-only">Navigare Habitoo CRM</SheetDescription>
              <Link
                to="/"
                onClick={() => setMenuOpen(false)}
                className="block w-36"
                aria-label="Habitoo CRM — pagina principală"
              >
                <img src={darkLogo.url} alt="Habitoo CRM" width={85} height={40} className="h-9 w-auto" />
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
              <Button asChild className="ds-btn ds-btn-primary h-12">
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