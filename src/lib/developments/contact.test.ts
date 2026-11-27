import { beforeEach, expect, it, vi } from 'vitest';
import type { Tables } from '@/integrations/supabase/types';
import type { FeedAuthOk } from '@/lib/site-feed/auth.server';
import { resolveDevelopmentContact, readDevelopmentContacts } from './contact.server';
import { readInvestmentData } from '@/lib/portals/storia/investment-data.server';
import { runDevelopmentWorker } from '@/lib/portals/storia/development.server';
import { mapInvestment } from '@/lib/portals/storia/investment';
import { storiaAgentPhotoUrl } from '@/lib/portals/storia/agent-photo';
import { CRM_URL } from '@/lib/host';
import { handleDevelopmentDetail, handleDevelopmentsList } from '@/lib/site-feed/developments.server';
import { handleAgentsList } from '@/lib/site-feed/handlers.server';
import { supabaseSyncDeps } from '@/lib/partner-api/sync.server';

type Row = Record<string, unknown>;
const mock = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, api: vi.fn(), listingPayload: vi.fn(), profileReads: 0, failProfiles: false, unitJob: false }));
const ORG = '11111111-1111-4111-8111-111111111111';
const DEV = '22222222-2222-4222-8222-222222222222';
const CREATOR = '33333333-3333-4333-8333-333333333333';
const ASSIGNEE = '44444444-4444-4444-8444-444444444444';
const UNIT = '55555555-5555-4555-8555-555555555555';
function from(table: string) {
  if (table === 'profiles') mock.profileReads++;
  const filters: ((row: Row) => boolean)[] = [];
  let range: [number, number] | null = null;
  const result = () => {
    const all = (mock.tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
    return { data: range ? all.slice(range[0], range[1] + 1) : all, count: all.length, error: table === 'profiles' && mock.failProfiles ? { message: 'read failed' } : null };
  };
  const q = {
    select: () => q, order: () => q, limit: () => q, update: () => q,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
    is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return q; },
    not: (key: string, _op: string, value: unknown) => { filters.push(row => (row[key] ?? null) !== value); return q; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return q; },
    range: (a: number, b: number) => { range = [a, b]; return q; },
    single: async () => ({ ...result(), data: result().data[0] ?? null }),
    maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return q;
}
const db = { from, rpc: async () => ({ data: [{ id: 'job', development_id: DEV, organization_id: ORG, operation: mock.unitJob ? 'unit' : 'publish', unit_id: mock.unitJob ? 'storia-unit' : null }], error: null }) };
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: db }));
vi.mock('@/lib/site-feed/selection.server', () => ({ selectedPropertyIdsForPortal: async () => [UNIT] }));
vi.mock('@/lib/developments/portal-selections.server', () => ({ selectedDevelopmentIds: async () => [DEV] }));
vi.mock('@/lib/portals/storia/oauth.server', () => ({ olxAuthorizedRequest: mock.api }));
vi.mock('@/lib/portals/storia/payload.server', () => ({ buildStoriaPayload: mock.listingPayload }));
vi.mock('@/lib/site-feed/property-media.server', () => ({ publishableImageTarget: async () => 'https://example.org/photo.jpg' }));
const development = () => (mock.tables['developments']?.[0] ?? {}) as unknown as Tables<'developments'>;
const auth = { ok: true, organizationId: ORG, tokenId: 'token', tokenPrefix: 'test', source: 'portal_key', portal: 'clickimob', scopes: ['feed:read', 'agents:read'] } as FeedAuthOk;
const request = (path: string) => new Request(`http://localhost:8080/api/public/sites/v1/${path}`);
beforeEach(() => {
  vi.clearAllMocks(); mock.profileReads = 0; mock.failProfiles = false; mock.unitJob = false;
  mock.api.mockResolvedValue({ status: 200, body: { data: { uuid: 'investment-uuid' } } });
  mock.tables = {
    developments: [{ id: DEV, organization_id: ORG, created_by: CREATOR, assigned_to: ASSIGNEE, name: 'MRM', description: 'Ansamblu fictiv', status: 'active', deleted_at: null,
      construction_stage: 'În construcție', area_from: 40, area_to: 120, price_per_sqm_from: 1500, estate_type: 'flats', total_units: 65,
      price_from: 100000, price_to: null, currency: 'EUR', lat: 44.4, lng: 26.1, location_precise: false, amenities: [], created_at: '2026-11-01', updated_at: '2026-11-20' }],
    profiles: [{ id: CREATOR, organization_id: ORG, full_name: 'Creator fictiv', email: 'creator@example.org', phone: '0700000001', avatar_url: 'org/creator.jpg', is_active: true, public_profile_hidden: false },
      { id: ASSIGNEE, organization_id: ORG, full_name: 'Agent alocat', email: 'assigned@example.org', phone: '0700000002', avatar_url: 'org/assigned.jpg', is_active: true, public_profile_hidden: false }],
    properties: [{ id: UNIT, reference: 'HB-UNIT', organization_id: ORG, assigned_to: ASSIGNEE, development_id: DEV, status: 'active', deleted_at: null, publish_status: 'published', for_sale: true, sale_price: 100000, sale_currency: 'EUR', currency: 'EUR', property_type: 'apartment', rooms: 2 }],
    development_images: [{ id: 'image', development_id: DEV, organization_id: ORG, storage_path: 'org/photo.jpg', is_primary: true, position: 0 }],
    development_portal_publications: [{ id: 'publication', development_id: DEV, organization_id: ORG, desired_active: true, status: 'draft', connection_id: 'connection', external_uuid: null }],
    portal_connections: [{ id: 'connection', organization_id: ORG, portal: 'storia_developer', status: 'connected' }],
    development_portal_selections: [{ development_id: DEV, portal_key: 'storia', enabled: true }],
    portal_publications: [{ property_id: UNIT, portal_key: 'storia', enabled: true }],
    storia_development_units: [{ id: 'storia-unit', development_id: DEV, property_id: UNIT, transaction_kind: 'sale', status: 'queued' }],
    organizations: [{ id: ORG }],
  };
});
it('creatorul activ este contactul chiar când agentul alocat diferă', async () => {
  expect(await resolveDevelopmentContact(db as never, development())).toMatchObject({ id: CREATOR, full_name: 'Creator fictiv', phone: '0700000001' });
});
it.each(['inactive', 'deleted', 'other-agency'])('creator %s → agentul alocat', async (scenario) => {
  mock.tables['profiles'] = (mock.tables['profiles'] ?? []).flatMap(row => row['id'] !== CREATOR ? [row] : scenario === 'deleted' ? [] : [{ ...row, ...(scenario === 'inactive' ? { is_active: false } : { organization_id: 'other-agency' }) }]);
  expect((await resolveDevelopmentContact(db as never, development()))?.id).toBe(ASSIGNEE);
});
it('fără creator eligibil și fără profil alocat întoarce null', async () => {
  mock.tables['profiles'] = [];
  expect(await resolveDevelopmentContact(db as never, development())).toBeNull();
});
it('fallback-ul păstrează profilul alocat inactiv, ca înainte', async () => {
  mock.tables['profiles'] = [{ id: ASSIGNEE, organization_id: ORG, is_active: false }];
  expect((await resolveDevelopmentContact(db as never, development()))?.id).toBe(ASSIGNEE);
});
it('fallback-ul din altă agenție nu este expus', async () => {
  mock.tables['profiles'] = [{ id: ASSIGNEE, organization_id: 'other-agency', is_active: true }];
  expect(await resolveDevelopmentContact(db as never, development())).toBeNull();
});
it('citirea în loturi folosește o singură citire de profil pentru 50 de ansambluri', async () => {
  const contacts = await readDevelopmentContacts(db as never, Array.from({ length: 50 }, (_, i) => ({ ...development(), id: String(i) })));
  expect(contacts.size).toBe(50); expect(contacts.get('49')?.id).toBe(CREATOR); expect(mock.profileReads).toBe(1);
});
it('o eroare de citire nu produce un fallback fals', async () => {
  mock.failProfiles = true;
  await expect(resolveDevelopmentContact(db as never, development())).rejects.toThrow('read failed');
});
it('Storia, lista/detaliul feedului și sincronizarea Partner API folosesc același creator', async () => {
  const input = await readInvestmentData(db as never, development());
  expect(input.agent?.id).toBe(CREATOR);
  await runDevelopmentWorker(db as never);
  const payload = mock.api.mock.calls[0]?.[3] as { contact?: unknown } | undefined;
  expect(payload?.contact).toEqual({ name: 'Creator fictiv', email: 'creator@example.org', phone: '0700000001', photo: storiaAgentPhotoUrl(CRM_URL, input.agent) });
  const list = await handleDevelopmentsList(request('developments'), auth);
  const detail = await handleDevelopmentDetail(request(`developments/${DEV}`), auth, DEV);
  expect((await list.response.json()).data[0].agent_id).toBe(CREATOR);
  expect((await detail.response.json()).data.agent_id).toBe(CREATOR);
  const deps = supabaseSyncDeps(db as never);
  const listings = await deps.eligibleListings('clickimob', ORG);
  const partners = await deps.eligibleDevelopments?.('clickimob', ORG);
  expect(partners?.developments[0]?.agent_id).toBe(CREATOR);
  expect(listings[0]?.agent_id).toBe(ASSIGNEE);
  const agents = await handleAgentsList(request('agents'), auth);
  expect((await agents.response.json()).data.map((agent: { idstr: string }) => agent.idstr)).toContain(CREATOR);
});
it('created_by = assigned_to produce exact payloadul Storia anterior', async () => {
  mock.tables['developments'] = [{ ...development(), assigned_to: CREATOR }];
  const agent = mock.tables['profiles']?.find(row => row['id'] === CREATOR);
  if (!agent) throw new Error('Lipsește creatorul fictiv');
  const legacy = mapInvestment(development(), { images: ['https://example.org/photo.jpg'], contact: { name: String(agent['full_name']), email: String(agent['email']), phone: String(agent['phone']), photo: `${CRM_URL}/api/public/sites/v1/media/agent/${CREATOR}?w=400&h=400&fit=cover` }, price: 100000, currency: 'EUR' });
  await runDevelopmentWorker(db as never);
  expect(mock.api.mock.calls[0]?.[3]).toEqual(legacy);
});
it('publicarea unității păstrează contactul propriu, fără citirea contactului ansamblului', async () => {
  mock.unitJob = true;
  const advert = mapInvestment(development(), { images: ['https://example.org/photo.jpg'], contact: { name: 'Agent alocat', email: 'assigned@example.org', phone: '0700000002' }, price: 100000, currency: 'EUR' });
  mock.listingPayload.mockResolvedValue({ ok: true, listings: [{ transaction: 'sale', advert }] });
  mock.tables['development_portal_publications'] = [{ id: 'publication', development_id: DEV, desired_active: true, status: 'published', connection_id: 'connection', external_uuid: 'parent' }];
  await runDevelopmentWorker(db as never);
  expect(mock.api.mock.calls[0]?.[3]?.contact).toEqual(advert.contact);
  expect(mock.profileReads).toBe(0);
});
