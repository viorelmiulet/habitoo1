import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/api/public/portal/v1/mvaimobiliare/visits')({
  server: { handlers: { POST: async ({ request }) => {
    const { handleMvaLeadRequest } = await import('@/lib/portals/mvaimobiliare/lead-handlers.server');
    return handleMvaLeadRequest(request, 'visits');
  } } },
});
