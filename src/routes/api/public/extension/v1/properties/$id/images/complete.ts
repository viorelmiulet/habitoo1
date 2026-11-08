import { createFileRoute } from "@tanstack/react-router";
import { serveExtension, methodNotAllowed } from "@/lib/extension/core";
import { extensionStore } from "@/lib/extension/store.server";
import * as h from "@/lib/extension/properties";
import { extensionPropertyStore } from "@/lib/extension/properties.server";

async function handle(request: Request, params: Record<string, string>) {
  const handler = request.method === "POST" ? h.completeImagesHandler(request, await extensionPropertyStore(), params.id) : methodNotAllowed;
  return serveExtension(request, await extensionStore(), handler);
}

export const Route = createFileRoute("/api/public/extension/v1/properties/$id/images/complete")({
  server: { handlers: { GET: ({ request, params }) => handle(request, params as Record<string, string>), POST: ({ request, params }) => handle(request, params as Record<string, string>) } },
});
