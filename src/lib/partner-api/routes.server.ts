import { servePartner, apiError, PARTNER_API_BASE, type PartnerContext } from "./core.server";
import { partnerStore } from "./store.server";
import type { PartnerReadStore } from "./read.server";

/** GET-only Partner API endpoint; the canonical template is logged, never the concrete path or query. */
export async function partnerGet(request: Request, template: string, run: (ctx: PartnerContext, store: PartnerReadStore) => Promise<Response> | Response) {
  return servePartner(request, await partnerStore(), async ctx => {
    if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED", "Această adresă acceptă doar GET.", ctx.requestId);
    const { supabaseReadStore } = await import("./read.server");
    return run(ctx, await supabaseReadStore());
  }, `${PARTNER_API_BASE}${template}`);
}
export const allMethods = (h: (request: Request, params: Record<string, string>) => Promise<Response>) => {
  const f = ({ request, params }: { request: Request; params: Record<string, string> }) => h(request, params);
  return { GET: f, POST: f, PUT: f, PATCH: f, DELETE: f };
};
