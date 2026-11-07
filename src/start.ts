import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  const pathname = new URL(request.url).pathname;
  // Rutele /lovable/* (webhook-uri, preview email) și feedul public de portaluri
  // (/api/public/*) se autentifică singure și răspund JSON, nu pagina HTML de eroare.
  if (pathname.startsWith("/lovable/") || pathname.startsWith("/api/public/")) {
    return next();
  }

  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const feedRegistryMiddleware = createMiddleware().server(async ({ next, request }) => {
  const path = new URL(request.url).pathname;
  // API auth resolves dynamic portals itself; pure media/static endpoints do not need a catalog read.
  if (path.startsWith("/api/public/") || path.startsWith("/lovable/")) return next();
  const { dynamicRegistryDefinitions } = await import("./lib/dynamic-feed-portals.server");
  const { withFeedDefinitions } = await import("./lib/feed-registry-scope.server");
  // Public pages see only the opt-in projection; CRM server functions get the complete scoped catalog.
  const { loadPublicDynamicFeedPortals } = await import("./lib/public-feed-portals.server");
  const { publicRead } = await import("./lib/public-read");
  const definitions = path.startsWith("/_serverFn/")
    ? await dynamicRegistryDefinitions()
    : await publicRead("public_feed_registry", loadPublicDynamicFeedPortals, []);
  return withFeedDefinitions(definitions, () => next());
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware, feedRegistryMiddleware],
}));
