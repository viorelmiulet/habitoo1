import { errorResponse, jsonResponse, FEED_API_VERSION, logFeedAccess, feedRequestRateLimited, type FeedAuthOk } from '@/lib/site-feed/auth.server';
import { contactSchema, handleSiteContact } from '@/lib/site-feed/contacts.server';
import { handleVisitsPost } from '@/lib/site-feed/visits.server';
import { MVA_LEAD_TOKEN_PATTERN, hashMvaLeadToken, mvaLeadHashesEqual } from './lead-tokens.server';

export type MvaLeadEndpoint = 'contacts' | 'visits' | 'views';
type Admin = any;
export async function authenticateMvaLeadRequest(request: Request, injectedDb?: Admin): Promise<FeedAuthOk | null> {
  // Bearer only: never accept feed/index tokens, Basic credentials or query-string secrets.
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  const token = match?.[1];
  if (!token || !MVA_LEAD_TOKEN_PATTERN.test(token)) return null;
  const db = injectedDb ?? (await import('@/integrations/supabase/client.server')).supabaseAdmin;
  const hash = hashMvaLeadToken(token);
  const { data, error } = await db.from('mva_lead_tokens').select('organization_id,token_hash').eq('token_hash', hash).maybeSingle();
  if (error) throw new Error('Token lookup unavailable');
  if (!mvaLeadHashesEqual(hash, data?.token_hash)) return null;
  const { data: connection, error: connError } = await db.from('portal_connections').select('activated,portal_credentials_encrypted').eq('organization_id', data.organization_id).eq('portal', 'mvaimobiliare').maybeSingle();
  if (connError) throw new Error('Connection lookup unavailable');
  if (!connection?.activated || !connection.portal_credentials_encrypted) return null;
  return { ok: true, organizationId: data.organization_id, tokenId: data.organization_id, tokenPrefix: 'mva_leads', source: 'portal_key', portal: 'mvaimobiliare', scopes: ['leads:write'] };
}
export async function handleMvaLeadRequest(request: Request, endpoint: MvaLeadEndpoint, injectedDb?: Admin): Promise<Response> {
  const access = { endpoint: `mvaimobiliare.${endpoint}`, method: request.method, tokenPrefix: 'mva_leads' };
  // Same limiter as feed requests; the key is a constant portal identity, never the secret.
  if (feedRequestRateLimited('mva_leads', request)) return errorResponse(429, 'Too many requests.');
  try {
    const db = injectedDb ?? (await import('@/integrations/supabase/client.server')).supabaseAdmin;
    const auth = await authenticateMvaLeadRequest(request, db);
    if (!auth) {
      await logFeedAccess({ ...access, organizationId: null, status: 401, detail: 'unauthorized' });
      return errorResponse(401, 'Invalid or revoked API token.');
    }
    let body: unknown;
    try { body = await request.json(); } catch { return errorResponse(400, 'Invalid JSON body.'); }
    let response: Response;
    let items = 0;
    if (endpoint === 'contacts') {
      const parsed = contactSchema.safeParse(body);
      if (!parsed.success) return errorResponse(422, 'Invalid payload.');
      const result = await handleSiteContact(db, { organizationId: auth.organizationId, portal: auth.portal }, parsed.data);
      response = 'message' in result ? errorResponse(result.status, result.message) : jsonResponse({ data: result.data, api_version: FEED_API_VERSION }, result.status);
      items = 'message' in result ? 0 : 1;
    } else {
      // The feed calls its view counter /visits. /views is a transport alias, not a new data contract.
      const result = await handleVisitsPost(db, auth, body);
      response = result.response;
      items = result.items ?? 0;
    }
    await logFeedAccess({ ...access, organizationId: auth.organizationId, status: response.status, items });
    return response;
  } catch {
    // No provider body, header, token, hash, payload or raw exception in logs or responses.
    return errorResponse(500, 'Internal error.');
  }
}
