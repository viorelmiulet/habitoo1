// GET /api/public/sites/v1/media/:id — URL public stabil pentru o imagine din feed.
// Redirect 302 către un URL semnat generat server-side; nu expune bucketul,
// nici credentiale de storage. Servește numai imagini marcate pentru publicare,
// ne-confidențiale, care aparțin unei proprietăți eligibile pentru feed.
import { createFileRoute } from "@tanstack/react-router";


export const Route = createFileRoute("/api/public/sites/v1/media/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { parseImageParams } = await import("@/lib/site-feed/image-params");
        const resize = parseImageParams(new URL(request.url).searchParams);
        // Acceptăm și forma `{id}.jpg`: unele portaluri (iMove) validează
        // extensia imaginii din URL înainte de a o descărca.
        const id = String(params.id ?? "").replace(/\.(jpe?g|png|webp)$/i, "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          return new Response("Not found", { status: 404 });
        }

        try {
          const { propertyMediaTarget } = await import("@/lib/site-feed/property-media.server");
          const { developmentMediaTarget } = await import('@/lib/site-feed/development-media.server');
          const target = await propertyMediaTarget(id, resize) ?? await developmentMediaTarget(id, resize);
          if (!target) return new Response("Not found", { status: 404 });

          return new Response(null, {
            status: 302,
            headers: {
              location: target,
              "cache-control": "public, max-age=60",
            },
          });
        } catch (error) {
          console.error("[site-feed] media redirect failed", error);
          return new Response("Internal error", { status: 500 });
        }
      },
    },
  },
});
