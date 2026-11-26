import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PortalContext } from '../adapter';
import { decryptPortalCredential } from '../crypto.server';

export const MVA_LEADS_BASE_URL = 'https://crm.habitoo.ro/api/public/portal/v1/mvaimobiliare';
export const MVA_LEAD_TOKEN_PATTERN = /^hbml_[A-Za-z0-9_-]{43}$/;
export const hashMvaLeadToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function generateMvaLeadToken() {
  const token = `hbml_${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashMvaLeadToken(token) };
}
export function mvaLeadHashesEqual(candidate: string, stored: string | null | undefined): boolean {
  const expected = stored && /^[a-f0-9]{64}$/.test(stored) ? stored : '0'.repeat(64);
  const matches = timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
  return Boolean(stored && matches);
}

type CachedToken = { token: string; hash: string; expiresAt: number };
// Only volatile memory holds a not-yet-confirmed token. A cold Worker replaces it instead of storing plaintext.
const pendingTokens = new Map<string, CachedToken>();
const CACHE_TTL_MS = 10 * 60_000;
export function clearMvaLeadTokenCache() { pendingTokens.clear(); }
// Same server-only boundary as the existing portal queue workers.
type Admin = any;
export type MvaLeadDelivery = { token: string; claim: string; cacheKey: string };
export async function prepareMvaLeadDelivery(ctx: PortalContext, injectedDb?: Admin): Promise<MvaLeadDelivery | null> {
  const db = injectedDb ?? (await import('@/integrations/supabase/client.server')).supabaseAdmin;
  const credential = ctx.portalCredential?.trim();
  if (!credential) throw new Error('Cheia mvaimobiliare.ro lipsește.');
  const { data: connection, error } = await db.from('portal_connections').select('portal_credentials_encrypted,activated').eq('organization_id', ctx.organizationId).eq('portal', 'mvaimobiliare').maybeSingle();
  if (error || !connection?.activated || !connection.portal_credentials_encrypted) throw new Error('Conexiunea mvaimobiliare.ro nu poate fi verificată.');
  const saved = decryptPortalCredential(connection.portal_credentials_encrypted);
  if (!saved || hashMvaLeadToken(saved.trim()) !== hashMvaLeadToken(credential)) throw new Error('Conexiunea mvaimobiliare.ro s-a schimbat. Repetă testul.');
  const { data: claimed, error: claimError } = await db.rpc('claim_mva_lead_delivery', { _org: ctx.organizationId, _credential_hash: hashMvaLeadToken(credential), _encrypted: connection.portal_credentials_encrypted });
  if (claimError || !claimed || (claimed.mode !== 'existing' && claimed.mode !== 'new')) throw new Error('Tokenul mvaimobiliare.ro nu poate fi livrat acum. Repetă testul.');
  if (claimed.mode === 'existing') return null;
  if (typeof claimed.claim_token !== 'string') throw new Error('Livrarea tokenului mvaimobiliare.ro nu poate fi confirmată.');
  const cacheKey = `${ctx.organizationId}:${hashMvaLeadToken(credential)}`;
  for (const [key, value] of pendingTokens) if (value.expiresAt < Date.now()) pendingTokens.delete(key);
  const cached = pendingTokens.get(cacheKey);
  const next = cached && cached.hash === claimed.token_hash ? cached : { ...generateMvaLeadToken(), expiresAt: Date.now() + CACHE_TTL_MS };
  const stored = await db.rpc('store_mva_lead_token_hash', { _org: ctx.organizationId, _claim: claimed.claim_token, _hash: next.hash });
  if (stored.error || stored.data !== true) throw new Error('Tokenul mvaimobiliare.ro nu a putut fi pregătit.');
  if (pendingTokens.size >= 1000) pendingTokens.clear();
  pendingTokens.set(cacheKey, next);
  return { token: next.token, claim: claimed.claim_token, cacheKey };
}
export async function finishMvaLeadDelivery(ctx: PortalContext, delivery: MvaLeadDelivery, delivered: boolean, injectedDb?: Admin): Promise<boolean> {
  const db = injectedDb ?? (await import('@/integrations/supabase/client.server')).supabaseAdmin;
  const result = await db.rpc('finish_mva_lead_delivery', { _org: ctx.organizationId, _claim: delivery.claim, _delivered: delivered });
  if (delivered) pendingTokens.delete(delivery.cacheKey);
  return !result.error && result.data === true;
}
