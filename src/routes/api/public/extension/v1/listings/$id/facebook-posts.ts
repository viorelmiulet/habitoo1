import { createFileRoute } from "@tanstack/react-router";
import { serveExtension, methodNotAllowed } from "@/lib/extension/core";
import { extensionStore } from "@/lib/extension/store.server";
import { facebookPostHandler } from "@/lib/extension/listings";
import { extensionListingsStore } from "@/lib/extension/listings.server";

async function handle(request: Request, id: string) {
  const handler = request.method === "POST" ? facebookPostHandler(request, await extensionListingsStore(), id) : methodNotAllowed;
  return serveExtension(request, await extensionStore(), handler);
}

export const Route = createFileRoute("/api/public/extension/v1/listings/$id/facebook-posts")({
  server: { handlers: { GET: ({ request, params }) => handle(request, params.id), POST: ({ request, params }) => handle(request, params.id) } },
});
