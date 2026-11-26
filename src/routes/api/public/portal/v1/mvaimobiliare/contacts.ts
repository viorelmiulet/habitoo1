import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/api/public/portal/v1/mvaimobiliare/contacts')({
  server: { handlers: { POST: async ({ request }) => {
    const { handleMvaLeadRequest } = await import('@/lib/portals/mvaimobiliare/lead-handlers.server');
    return handleMvaLeadRequest(request, 'contacts');
  } } },
});
