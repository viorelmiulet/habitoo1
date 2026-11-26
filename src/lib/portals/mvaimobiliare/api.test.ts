import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mvaimobiliareAdapter, readMvaPage } from '../adapters/mvaimobiliare.server';
import { mvaRequest, MVA_TIMEOUT_MS } from './api.server';
import { buildMvaPayload, buildMvaAgency } from './payload.server';
import { properstarEntityId } from '../properstar/mapper';
import { getPortalDefinition } from '../registry';
import { mapAgent, mapPropertyToFeed, type PropertyRow, type ProfileRow } from '@/lib/site-feed/mapper';
import { handlePropertiesList, handleAgentsList } from '@/lib/site-feed/handlers.server';
import { clickimobAgencyContact } from '../clickimob/index-feed';
import { indexLogoUrl } from '../clickimob/index-feed.server';
import { isTransientPublishFailure } from '../transient-failure';
import { fakeMvaDb } from './test-db';

const ORG = '11111111-1111-4111-8111-111111111111';
const KEY = 'fictitious-mva-api-key-for-tests';
let db = fakeMvaDb();
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (t: string) => db.from(t) } }));
const { noKeyPublish, noKeyWithdraw } = vi.hoisted(() => ({
  noKeyPublish: vi.fn(async () => ({ ok: true, data: { live: false, feedVisible: true } })),
  noKeyWithdraw: vi.fn(async () => ({ ok: true, data: { live: false } })),
}));
vi.mock('../adapters/clickimob.server', () => ({ createIndexFeedAdapter: () => ({ publishListing: noKeyPublish, withdrawListing: noKeyWithdraw, getStatus: noKeyPublish }) }));
function context(key: string | null = KEY) {
  const definition = getPortalDefinition('mvaimobiliare');
  if (!definition) throw new Error('Missing MVA definition');
  return { organizationId: ORG, definition, direction: 'habitoo_to_portal' as const, authenticationMode: 'portal_api_key' as const, externalAccountId: null, portalCredential: key, settings: {}, allowLiveRequests: true };
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset(); noKeyPublish.mockClear(); noKeyWithdraw.mockClear();
  fetchMock.mockImplementation(async () => { throw new Error('Unexpected external call'); });
  vi.stubGlobal('fetch', fetchMock);
  db = fakeMvaDb({
    organizations: [{ id: ORG, name: 'Agenția Test', legal_name: 'Test SRL', email: 'office@example.org', phone: '0700000000', material_email: 'material@example.org', material_phone: '0700000001', material_website: 'https://example.org', material_address: 'Adresa agenției', city: 'București', logo_path: 'private/logo.png', updated_at: '2026-11-26' }],
    properties: [{ id: 'p1', reference: 'HB/123', organization_id: ORG, assigned_to: 'agent1', title: 'Apartament', status: 'active', publish_status: 'published', transaction: 'sale', deleted_at: null, development_id: 'dev1' }],
    profiles: [{ id: 'agent1', organization_id: ORG, full_name: 'Agent Test', email: 'agent@example.org', phone: '0700000002', is_active: true, avatar_url: 'private/avatar.png' }],
    property_images: [{ id: 'img1', organization_id: ORG, property_id: 'p1', include_in_publish: true, is_confidential: false, is_primary: true, sort_order: 0 }],
    portal_publications: [{ organization_id: ORG, property_id: 'p1', portal_key: 'mvaimobiliare', enabled: true }],
    developments: [{ id: 'dev1', organization_id: ORG, storia_hide_price: true }],
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('API mvaimobiliare.ro — exclusiv simulată', () => {
  it('testul verifică ID-ul hb și trimite apoi exact contactul și logo-ul indexului', async () => {
    fetchMock.mockResolvedValueOnce(reply({ agency_id: properstarEntityId('hb', ORG), name: 'Test', listings: 1 })).mockResolvedValueOnce(reply({ status: 'updated' }));
    expect(await mvaimobiliareAdapter.testConnection(context())).toMatchObject({ ok: true, data: { configured: true, live: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://www.mvaimobiliare.ro/api/public/habitoo/v1/account');
    const call = fetchMock.mock.calls[1];
    expect(call?.[0]).toBe('https://www.mvaimobiliare.ro/api/public/habitoo/v1/agency');
    expect(call?.[1]?.method).toBe('PUT');
    const row = db.rows['organizations']?.[0];
    if (!row) throw new Error('Missing fixture');
    const { cui: _cui, county: _county, ...expected } = clickimobAgencyContact({ ...row, logo_url: indexLogoUrl(row as any) } as any);
    expect(JSON.parse(String(call?.[1]?.body))).toEqual(expected);
    expect(await buildMvaAgency(ORG)).toEqual(expected);
    expect(MVA_TIMEOUT_MS).toBe(20_000);
    expect(call?.[1]?.redirect).toBe('manual');
  });
  it('cheia altei agenții oprește testul înainte de PUT /agency', async () => {
    fetchMock.mockResolvedValue(reply({ agency_id: 'hbOTHER' }));
    expect(await mvaimobiliareAdapter.testConnection(context())).toMatchObject({ ok: false, code: 'AUTH_ERROR', message: 'Cheia aparține altei agenții pe mvaimobiliare.ro.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('401 devine eroare de cheie, fără răspunsul brut sau cheia în mesaj', async () => {
    fetchMock.mockResolvedValue(reply({ error: KEY }, 401));
    const result = await mvaimobiliareAdapter.testConnection(context());
    expect(result).toMatchObject({ ok: false, code: 'AUTH_ERROR', httpStatus: 401 });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
  it('PUT trimite property și agent identice cu feedurile reale și reține URL-ul primit', async () => {
    const payload = await buildMvaPayload(ORG, 'p1');
    const auth = { organizationId: ORG, portal: 'mvaimobiliare', scopes: ['feed:read', 'agents:read'], tokenPrefix: 'fixture', tokenId: null } as any;
    const properties = await handlePropertiesList(new Request('https://crm.habitoo.ro/api/public/sites/v1/properties'), auth);
    const agents = await handleAgentsList(new Request('https://crm.habitoo.ro/api/public/sites/v1/agents'), auth);
    expect(JSON.parse(JSON.stringify(payload.property))).toEqual((await properties.response.json()).data[0]);
    expect(JSON.parse(JSON.stringify(payload.agent))).toEqual((await agents.response.json()).data[0]);
    const row = db.rows['properties']?.[0] as PropertyRow | undefined;
    const profile = db.rows['profiles']?.[0] as ProfileRow | undefined;
    if (!row || !profile) throw new Error('Missing fixtures');
    expect(payload.property).toEqual(mapPropertyToFeed(row, { baseUrl: 'https://crm.habitoo.ro', publicSiteUrl: 'https://www.habitoo.ro', images: db.rows['property_images'] as any, agent: profile, portalKeys: ['mvaimobiliare'], developmentHidePrice: true }));
    expect(payload.agent).toEqual(mapAgent(profile, 'https://crm.habitoo.ro'));
    fetchMock.mockImplementation(async () => reply({ status: 'published', url: 'https://www.mvaimobiliare.ro/anunt/confirmat' }));
    for (const operation of [mvaimobiliareAdapter.publishListing, mvaimobiliareAdapter.updateListing]) {
      expect(await operation(context(), { propertyId: 'p1', externalId: null })).toMatchObject({ ok: true, data: { externalId: 'HB/123', publicUrl: 'https://www.mvaimobiliare.ro/anunt/confirmat' } });
    }
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe('https://www.mvaimobiliare.ro/api/public/habitoo/v1/listings/HB%2F123');
    expect(call?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual(JSON.parse(JSON.stringify(payload)));
  });
  it('retragerea trimite DELETE cu idstr salvat, fără verificarea feedului', async () => {
    db.rows['portal_publications'] = [];
    fetchMock.mockResolvedValue(reply({ status: 'withdrawn' }));
    expect(await mvaimobiliareAdapter.withdrawListing(context(), { propertyId: 'p1', externalId: 'HB/old' })).toMatchObject({ ok: true, data: { externalId: 'HB/old' } });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/listings/HB%2Fold');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });
  it('422 afișează câmpurile, dar elimină cheia chiar dacă portalul o repetă', async () => {
    fetchMock.mockResolvedValue(reply({ error: 'invalid', fields: { pret: ['Preț invalid'], titlu: `Nu include ${KEY}` } }, 422));
    const result = await mvaRequest(context(), 'PUT', '/listings/ref', {});
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR', message: expect.stringContaining('pret: Preț invalid') });
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(isTransientPublishFailure({ ...result, portalId: 'mvaimobiliare' })).toBe(false);
  });
  it.each([429, 500, 503])('HTTP %i este reîncercabil prin regula cozii existente', async status => {
    fetchMock.mockResolvedValue(reply({}, status));
    const result = await mvaRequest(context(), 'PUT', '/listings/ref', {});
    if (result.ok) throw new Error('Expected failure');
    expect(isTransientPublishFailure({ ...result, portalId: 'mvaimobiliare' })).toBe(true);
  });
  it('fără cheie nu face niciun apel API și reutilizează feedul', async () => {
    await mvaimobiliareAdapter.publishListing(context(null), { propertyId: 'p1', externalId: null });
    await mvaimobiliareAdapter.withdrawListing(context(null), { propertyId: 'p1', externalId: null });
    await mvaimobiliareAdapter.testConnection(context(null));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(noKeyPublish).toHaveBeenCalledTimes(1);
    expect(noKeyWithdraw).toHaveBeenCalledTimes(1);
  });
  it('inventarul invalid nu poate fi folosit pentru retrageri', async () => {
    fetchMock.mockResolvedValue(reply({ data: [{ idstr: 'p' }], page: 1, last_page: 2, total: 1 }));
    expect(await readMvaPage(context(), 1)).toMatchObject({ ok: false, code: 'PORTAL_ERROR' });
  });
});
