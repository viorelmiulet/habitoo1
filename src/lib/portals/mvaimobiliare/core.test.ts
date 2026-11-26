import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fakeMvaDb } from './test-db';
import { properstarEntityId } from '../properstar/mapper';
import { mvaCredentialHash } from './sync.server';
import { mvaimobiliareAdapter } from '../adapters/mvaimobiliare.server';
vi.mock('@tanstack/react-start', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-start')>();
  const build = () => {
    const self: Record<string, unknown> = {};
    self['middleware'] = () => self; self['inputValidator'] = () => self; self['handler'] = (fn: unknown) => fn;
    return self;
  };
  return { ...actual, createServerFn: build, createMiddleware: () => ({ middleware: () => ({ server: () => ({}) }), server: () => ({}) }) };
});
vi.mock('@/lib/org-access', () => ({ requireActiveOrgAuth: {} }));
vi.mock('../rate-limit.server', () => ({ portalRateLimited: () => limited }));
vi.mock('../crypto.server', () => ({ decryptPortalCredential: () => KEY }));
vi.mock('../requirements.server', () => ({ portalRequirementReport: async () => null }));
vi.mock('../adapters/index.server', () => ({ getPortalAdapter: () => mvaimobiliareAdapter }));
vi.mock('../failure-notification.server', () => ({ notifyPortalFailure: (...args: unknown[]) => alert(...args) }));
const ORG = '11111111-1111-4111-8111-111111111111';
const KEY = 'fictitious-mva-core-key';
let db = fakeMvaDb(); let limited = false;
const alert = vi.fn(async (..._args: unknown[]) => undefined);
const fetchMock = vi.fn<typeof fetch>();
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (t: string) => db.from(t), rpc: (name: string, args: unknown) => db.rpc(name, args) } }));
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  limited = false; alert.mockClear(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async () => { throw new Error('No real external calls'); });
  db = fakeMvaDb({
    portal_connections: [{ id: 'c1', organization_id: ORG, portal: 'mvaimobiliare', activated: true, portal_credentials_encrypted: 'fixture-encrypted', settings: { allow_live: true } }],
    properties: [{ id: 'p1', organization_id: ORG, reference: 'HB-1', title: 'Apartament test', status: 'active', publish_status: 'published', deleted_at: null }],
    portal_publications: [{ property_id: 'p1', organization_id: ORG, portal_key: 'mvaimobiliare', enabled: true }],
    organizations: [{ id: ORG, name: 'Test Agency' }],
  });
  db.rpc = vi.fn(async () => ({ data: 'sync1', error: null }));
});
afterEach(() => vi.unstubAllGlobals());
describe('conexiune și publicare prin funcțiile comune — API simulată', () => {
  it('primul test reușit verifică contul, actualizează agenția și înscrie sincronizarea', async () => {
    fetchMock.mockResolvedValueOnce(reply({ agency_id: properstarEntityId('hb', ORG) })).mockResolvedValueOnce(reply({ status: 'updated' }));
    const { testPortalConnectionCore } = await import('@/lib/portals.functions');
    expect(await testPortalConnectionCore({ organizationId: ORG, actorId: 'actor1', portalId: 'mvaimobiliare' })).toMatchObject({ ok: true, live: true });
    expect(db.rpc).toHaveBeenCalledWith('start_mva_initial_sync', { _org: ORG, _actor: 'actor1', _hash: mvaCredentialHash(KEY), _encrypted: 'fixture-encrypted' });
    expect(db.rows['portal_connections']?.[0]?.['status']).toBe('connected');
  });
  it.each([401, 200])('testul eșuat (%i / altă agenție) nu înscrie sincronizarea', async status => {
    fetchMock.mockResolvedValue(reply({ agency_id: 'hbOTHER', error: KEY }, status));
    const { testPortalConnectionCore } = await import('@/lib/portals.functions');
    expect(await testPortalConnectionCore({ organizationId: ORG, actorId: 'actor1', portalId: 'mvaimobiliare' })).toMatchObject({ ok: false, code: 'AUTH_ERROR' });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.rows['portal_connections']?.[0]?.['status']).toBe('error');
    expect(JSON.stringify(db.rows['portal_operation_logs'])).not.toContain(KEY);
  });
  it('publicarea salvează URL-ul real întors de portal în linkul public al anunțului', async () => {
    fetchMock.mockResolvedValue(reply({ status: 'published', url: 'https://www.mvaimobiliare.ro/anunt/real-response' }));
    const { executeListingAction } = await import('@/lib/portals.functions');
    expect(await executeListingAction({ organizationId: ORG, actorId: 'actor1', portalId: 'mvaimobiliare', propertyId: 'p1', action: 'publish', skipSlotCheck: true })).toMatchObject({ ok: true });
    expect(db.rows['portal_listings']?.[0]).toMatchObject({ external_id: 'HB-1', public_url: 'https://www.mvaimobiliare.ro/anunt/real-response' });
  });
  it('401 la publicare marchează conexiunea cu eroare și sincronizarea nu trimite alertă individuală', async () => {
    fetchMock.mockResolvedValue(reply({ error: KEY }, 401));
    const { executeListingAction } = await import('@/lib/portals.functions');
    expect(await executeListingAction({ organizationId: ORG, actorId: 'actor1', portalId: 'mvaimobiliare', propertyId: 'p1', action: 'publish', skipSlotCheck: true, suppressFailureNotification: true })).toMatchObject({ ok: false, code: 'AUTH_ERROR' });
    expect(db.rows['portal_connections']?.[0]?.['status']).toBe('error');
    expect(alert).not.toHaveBeenCalled();
    expect(JSON.stringify(db.rows['portal_operation_logs'])).not.toContain(KEY);
  });
  it('erorile normale păstrează notificarea existentă; blocarea locală din sincronizare nu notifică separat', async () => {
    fetchMock.mockResolvedValue(reply({}, 401));
    const { executeListingAction } = await import('@/lib/portals.functions');
    await executeListingAction({ organizationId: ORG, actorId: 'actor1', portalId: 'mvaimobiliare', propertyId: 'p1', action: 'publish', skipSlotCheck: true });
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockClear(); limited = true;
    await executeListingAction({ organizationId: ORG, actorId: 'actor1', portalId: 'mvaimobiliare', propertyId: 'p1', action: 'publish', skipSlotCheck: true, suppressFailureNotification: true });
    expect(alert).not.toHaveBeenCalled();
  });
});
