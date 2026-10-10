import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentHostname } from "@/lib/current-host";
import { getCrmUrl, isCrmPath, isPublicHostname } from "@/lib/host";

function NotFoundComponent() {
  const links = [
    { to: "/", label: "Pagina principală" },
    { to: "/functionalitati", label: "Funcționalități" },
    { to: "/preturi", label: "Prețuri" },
    { to: "/blog", label: "Blog" },
  ] as const;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-7xl font-bold text-foreground">404</p>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Pagina nu a fost găsită</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pagina căutată nu există sau a fost mutată.
        </p>
        <nav aria-label="Linkuri utile" className="mt-6 flex flex-wrap justify-center gap-2">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Domeniile publice (habitoo.ro / www.habitoo.ro) servesc doar marketingul:
  // orice rută CRM/auth este redirectată pe crm.habitoo.ro, cu query + hash.
  beforeLoad: ({ location }) => {
    // Rutele server /lovable/* (webhook-uri email, preview) nu trec prin redirecturi.
    if (location.pathname.startsWith("/lovable/")) return;
    const host = getCurrentHostname();
    if (isPublicHostname(host) && isCrmPath(location.pathname)) {
      throw redirect({
        href: getCrmUrl(
          `${location.pathname}${location.searchStr ?? ""}${location.hash ? `#${location.hash}` : ""}`,
        ),
      });
    }
  },
  head: ({ matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "Habitoo" },
      // Sitewide default — folosit doar de paginile fără titlu propriu.
      // Paginile publice își definesc titlul prin publicHead().
      { title: "Habitoo CRM — CRM imobiliar pentru agenții din România" },
      {
        name: "description",
        content:
          "Habitoo CRM organizează proprietățile, clienții, cererile și lead-urile agenției tale, cu matching automat, pipeline vizual, calendar și rapoarte. Creează agenția în câteva minute.",
      },
      { property: "og:title", content: "Habitoo CRM — CRM imobiliar pentru agenții din România" },
      {
        property: "og:description",
        content:
          "Habitoo CRM organizează proprietățile, clienții, cererile și lead-urile agenției tale, cu matching automat, pipeline vizual, calendar și rapoarte. Creează agenția în câteva minute.",
      },
      // Doar ruta rădăcină potrivită = URL inexistent (404 global).
      ...(matches.length === 1
        ? [
            { title: "Pagina nu a fost găsită — Habitoo CRM" },
            { name: "robots", content: "noindex" },
          ]
        : []),
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ro">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
