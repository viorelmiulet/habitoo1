import type { PortalAdapter, PortalContext, ListingRef, ListingOutcome, ConnectionStatusOutcome, PortalResult } from '../adapter';
import { properstarEntityId } from '../properstar/mapper';
import { mvaRequest } from '../mvaimobiliare/api.server';
import { buildMvaAgency, buildMvaPayload, mvaListingId } from '../mvaimobiliare/payload.server';
import { prepareMvaLeadDelivery, finishMvaLeadDelivery, MVA_LEADS_BASE_URL } from '../mvaimobiliare/lead-tokens.server';
import { createIndexFeedAdapter } from './clickimob.server';

const feed = createIndexFeedAdapter('mvaimobiliare', 'mvaimobiliare.ro');
export type MvaRemotePage = { data: { idstr: string; is_published: boolean; url: string | null; updated_at: string }[]; page: number; last_page: number; total: number };
export async function readMvaPage(ctx: PortalContext, page: number): Promise<PortalResult<MvaRemotePage>> {
  const result = await mvaRequest<MvaRemotePage>(ctx, 'GET', `/listings?page=${page}`);
  if (!result.ok) return result;
  const data = result.data;
  if (!data || !Array.isArray(data.data) || data.page !== page || !Number.isInteger(data.last_page) || data.last_page < page || !Number.isInteger(data.total) || data.total < 0 || data.data.some(r => !r || typeof r.idstr !== 'string' || !r.idstr || typeof r.is_published !== 'boolean')) {
    return { ok: false, code: 'PORTAL_ERROR', message: 'mvaimobiliare.ro: inventarul anunțurilor nu a fost citit complet.' };
  }
  return result;
}
export function deleteMvaListing(ctx: PortalContext, idstr: string) {
  return mvaRequest<{ status: string }>(ctx, 'DELETE', `/listings/${encodeURIComponent(idstr)}`);
}
async function account(ctx: PortalContext, updateAgency: boolean): Promise<PortalResult<ConnectionStatusOutcome>> {
  const result = await mvaRequest<{ agency_id: string }>(ctx, 'GET', '/account');
  if (!result.ok) return result;
  if (result.data?.agency_id !== properstarEntityId('hb', ctx.organizationId)) return { ok: false, code: 'AUTH_ERROR', message: 'Cheia aparține altei agenții pe mvaimobiliare.ro.' };
  if (updateAgency) {
    try {
      const agency = await buildMvaAgency(ctx.organizationId);
      const delivery = await prepareMvaLeadDelivery(ctx);
      const updated = await mvaRequest(ctx, 'PUT', '/agency', { ...agency, ...(delivery ? { habitoo_leads: { base_url: MVA_LEADS_BASE_URL, token: delivery.token } } : {}) });
      const confirmed = delivery ? await finishMvaLeadDelivery(ctx, delivery, updated.ok) : true;
      if (!updated.ok) return updated;
      if (!confirmed) return { ok: false, code: 'CONFIG_ERROR', message: 'Livrarea tokenului mvaimobiliare.ro nu a putut fi confirmată. Repetă testul.' };
    } catch {
      return { ok: false, code: 'CONFIG_ERROR', message: 'Tokenul pentru cererile mvaimobiliare.ro nu poate fi livrat acum. Repetă testul conexiunii.' };
    }
  }
  return { ok: true, data: { configured: true, live: true, detail: 'Conexiune mvaimobiliare.ro verificată.' } };
}
async function push(ctx: PortalContext, ref: ListingRef): Promise<PortalResult<ListingOutcome>> {
  if (!ctx.portalCredential?.trim()) return feed.publishListing(ctx, ref);
  if (!ctx.allowLiveRequests) return { ok: true, data: { externalId: ref.externalId, live: false, detail: 'dry_run mvaimobiliare' } };
  const payload = await buildMvaPayload(ctx.organizationId, ref.propertyId);
  const result = await mvaRequest<{ status: string; url: string }>(ctx, 'PUT', `/listings/${encodeURIComponent(payload.property.idstr)}`, payload);
  if (!result.ok) return result;
  if (result.data?.status !== 'published') return { ok: false, code: 'PORTAL_ERROR', message: 'mvaimobiliare.ro nu a confirmat publicarea anunțului.' };
  // Only the returned, HTTPS public URL is persisted, never a guessed URL or a secret echo.
  let publicUrl: string | null = null;
  try { const url = new URL(result.data.url); if (url.protocol === 'https:' && !url.username && !url.password && !result.data.url.includes(ctx.portalCredential)) publicUrl = url.toString(); } catch { /* no confirmed link */ }
  return { ok: true, data: { externalId: payload.property.idstr, live: true, publicUrl, detail: 'mvaimobiliare listing published', portalStatus: 'published' } };
}
export const mvaimobiliareAdapter: PortalAdapter = {
  id: 'mvaimobiliare',
  testConnection: ctx => account(ctx, true),
  getStatus: ctx => ctx.portalCredential?.trim() ? account(ctx, false) : feed.getStatus(ctx),
  publishListing: push,
  updateListing: push,
  async withdrawListing(ctx, ref) {
    if (!ctx.portalCredential?.trim()) return feed.withdrawListing(ctx, ref);
    if (!ctx.allowLiveRequests) return { ok: true, data: { externalId: ref.externalId, live: false, detail: 'dry_run mvaimobiliare withdraw' } };
    const id = ref.externalId ?? await mvaListingId(ctx.organizationId, ref.propertyId);
    const result = await deleteMvaListing(ctx, id);
    if (!result.ok) return result;
    if (result.data?.status !== 'withdrawn') return { ok: false, code: 'PORTAL_ERROR', message: 'mvaimobiliare.ro nu a confirmat retragerea anunțului.' };
    return { ok: true, data: { externalId: id, live: true, detail: 'mvaimobiliare listing withdrawn', portalStatus: 'withdrawn' } };
  },
  async sync(ctx, refs) {
    let processed = 0; let failed = 0;
    for (const ref of refs) { const result = await push(ctx, ref); if (result.ok) processed++; else failed++; }
    return { ok: true, data: { processed, failed } };
  },
};
