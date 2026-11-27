import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./lead-tokens.server', () => ({
  prepareMvaLeadDelivery: async () => null, finishMvaLeadDelivery: async () => true,
  MVA_LEADS_BASE_URL: 'https://crm.habitoo.ro/api/public/portal/v1/mvaimobiliare',
}));
import { fakeMvaDb } from './test-db';
import { properstarEntityId } from '../properstar/mapper';
import { mvaCredentialHash } from './sync.server';
import { mvaimobiliareAdapter } from '../adapters/mvaimobiliare.server';
import { runMvaWithdrawalJob } from './withdraw.server';
import { runPortalPublishWorker, type PublishJobRow } from '../publish-jobs.server';
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
  it.each(['listă', 'fișă', 'acțiuni în masă'])('deselectare din %s: pune în coadă, apoi un DELETE cu idstr-ul publicat', async source => {
    db.rows['portal_listings'] = [{ id: 'l1', organization_id: ORG, property_id: 'p1', portal: 'mvaimobiliare', external_id: 'HB-1465', status: 'published' }];
    const { applyPortalSelectionForOrg, setPropertyPortalSelection, executeListingAction } = await import('@/lib/portals.functions');
    const job: PublishJobRow = { id: 'j1', organization_id: ORG, property_id: 'p1', portal_key: 'mvaimobiliare', enabled: false,
      promoted: null, sync_existing: false, requested_by: 'actor1', superadmin: true, attempts: 1, mva_withdraw_idstr: 'HB-1465' };
    db.rpc = vi.fn(async () => ({ data: 'j1', error: null }));
    if (source === 'listă') {
      await (setPropertyPortalSelection as unknown as (args: unknown) => Promise<unknown>)({
        data: { organizationId: ORG, propertyId: 'p1', portalId: 'mvaimobiliare', enabled: false },
        context: { userId: 'actor1', supabase: { rpc: async () => ({ data: true }) } },
      });
    } else {
      expect(await applyPortalSelectionForOrg({ organizationId: ORG, superadmin: true, actorId: 'actor1',
        data: { propertyId: 'p1', selections: [{ portalId: 'mvaimobiliare', enabled: false }], syncExisting: false } })).toMatchObject({ ok: true });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledWith('request_mva_withdrawal', { _org: ORG, _property: 'p1', _actor: 'actor1' });
    fetchMock.mockResolvedValue(reply({ status: 'withdrawn' }));
    expect(await runMvaWithdrawalJob(db, job, executeListingAction)).toMatchObject({ ok: true, action: 'withdrawn' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://www.mvaimobiliare.ro/api/public/habitoo/v1/listings/HB-1465');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
    expect(db.rows['portal_operation_logs']?.find(r => r['operation'] === 'withdraw')).toMatchObject({ success: true, http_status: 200 });
    const { performPortalWithdraw } = await import('@/lib/portals.functions');
    db.rpc = vi.fn(async () => ({ data: 'j2', error: null }));
    expect(await performPortalWithdraw({ organizationId: ORG, propertyId: 'p1', portalId: 'mvaimobiliare', actorId: 'actor1', withdrawReason: 'status_sold' })).toMatchObject({ ok: true, alreadyWithdrawn: true });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('5xx păstrează idstr și workerul programează retry, apoi confirmă DELETE', async () => {
    const { executeListingAction } = await import('@/lib/portals.functions');
    db.rows['portal_publications'] = [{ organization_id: ORG, property_id: 'p1', portal_key: 'mvaimobiliare', enabled: false, external_ref: 'HB-1465' }];
    const job = { id: 'j1', organization_id: ORG, property_id: 'p1', portal_key: 'mvaimobiliare', enabled: false,
      promoted: null, sync_existing: false, requested_by: 'actor1', superadmin: true, attempts: 0,
      mva_withdraw_idstr: 'HB-1465', status: 'queued', next_attempt_at: new Date(0).toISOString() };
    db.rows['portal_publish_jobs'] = [job];
    db.rpc = vi.fn(async () => {
      if (job.status !== 'queued' || Date.parse(job.next_attempt_at) > Date.now()) return { data: [], error: null };
      job.status = 'running'; job.attempts++;
      return { data: [{ ...job }], error: null };
    });
    fetchMock.mockResolvedValueOnce(reply({ error: `temporary ${KEY}` }, 503)).mockResolvedValueOnce(reply({ status: 'withdrawn' }));
    const apply = (j: PublishJobRow) => runMvaWithdrawalJob(db, j, executeListingAction);
    expect(await runPortalPublishWorker(db, apply, { concurrency: 1 })).toMatchObject({ retried: 1 });
    expect(job.status).toBe('queued');
    expect(Date.parse(job.next_attempt_at)).toBeGreaterThan(Date.now() + 115_000);
    expect(db.rows['portal_publications']?.[0]?.['external_ref']).toBe('HB-1465');
    expect(db.rows['portal_operation_logs']?.[0]).toMatchObject({ operation: 'withdraw', success: false, http_status: 503 });
    expect(JSON.stringify(db.rows['portal_operation_logs'])).not.toContain(KEY);
    job.next_attempt_at = new Date(0).toISOString();
    expect(await runPortalPublishWorker(db, apply, { concurrency: 1 })).toMatchObject({ done: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(c => c[1]?.method)).toEqual(['DELETE', 'DELETE']);
  });
  it('404 este succes în starea locală și în jurnalul withdraw, cu răspunsul portalului', async () => {
    const { executeListingAction } = await import('@/lib/portals.functions');
    db.rows['portal_publications'] = [{ organization_id: ORG, property_id: 'p1', portal_key: 'mvaimobiliare', enabled: false, external_ref: 'HB-1465' }];
    fetchMock.mockResolvedValue(reply({ error: 'not_found' }, 404));
    expect(await executeListingAction({ organizationId: ORG, propertyId: 'p1', portalId: 'mvaimobiliare', actorId: 'actor1', action: 'withdraw' })).toMatchObject({ ok: true, status: 'withdrawn' });
    expect(db.rows['portal_publications']?.[0]).toMatchObject({ status: 'disabled', last_error: null });
    const log = db.rows['portal_operation_logs']?.[0];
    expect(log).toMatchObject({ operation: 'withdraw', success: true, http_status: 404 });
    expect(JSON.stringify(log?.['portal_response'])).toContain('not_found');
    expect(alert).not.toHaveBeenCalled();
  });
  it('jurnalul răspunsului elimină cheia și tokenurile inclusiv din numele câmpurilor', async () => {
    const { executeListingAction } = await import('@/lib/portals.functions');
    fetchMock.mockResolvedValue(reply({ [KEY]: KEY, token: 'hbml_' + 'a'.repeat(43), nested: { authorization: `Bearer ${KEY}` } }, 503));
    await executeListingAction({ organizationId: ORG, propertyId: 'p1', portalId: 'mvaimobiliare', actorId: 'actor1', action: 'withdraw', mvaWithdrawIdstr: 'HB-1465' });
    const logs = JSON.stringify(db.rows['portal_operation_logs']);
    expect(logs).not.toContain(KEY);
    expect(logs).not.toContain('hbml_' + 'a'.repeat(43));
    expect(db.rows['portal_operation_logs']?.[0]).toMatchObject({ operation: 'withdraw', http_status: 503 });
  });
  it('apelurile live oprite nu raportează o retragere API reușită', async () => {
    const connection = db.rows['portal_connections']?.[0];
    if (!connection) throw new Error('Missing fixture');
    connection['settings'] = { allow_live: false };
    const { executeListingAction } = await import('@/lib/portals.functions');
    expect(await executeListingAction({ organizationId: ORG, propertyId: 'p1', portalId: 'mvaimobiliare', actorId: 'actor1', action: 'withdraw', mvaWithdrawIdstr: 'HB-1465' })).toMatchObject({ ok: false, code: 'CONFIG_ERROR' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.rows['portal_listings']?.[0]?.['status']).toBe('error');
  });
  it('workerul ștergerii contului așteaptă DELETE și nu pierde retragerea prin ștergerea joburilor', async () => {
    const { performPortalWithdraw } = await import('@/lib/portals.functions');
    fetchMock.mockResolvedValue(reply({ status: 'withdrawn' }));
    expect(await performPortalWithdraw({ organizationId: ORG, propertyId: 'p1', portalId: 'mvaimobiliare', actorId: 'actor1', withdrawReason: 'account_deleted' })).toMatchObject({ ok: true, attempted: true });
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each(['sold', 'archived', 'deleted', 'withdrawn'])('workerul retrage oferta neeligibilă: %s', async reason => {
    const { executeListingAction } = await import('@/lib/portals.functions');
    const property = db.rows['properties']?.[0];
    if (!property) throw new Error('Missing fixture');
    if (reason === 'deleted') property['deleted_at'] = '2026-11-27';
    else if (reason === 'withdrawn') property['publish_status'] = 'withdrawn';
    else property['status'] = reason;
    fetchMock.mockResolvedValue(reply({ status: 'withdrawn' }));
    expect(await runMvaWithdrawalJob(db, { id: 'j1', organization_id: ORG, property_id: 'p1', portal_key: 'mvaimobiliare', enabled: false,
      promoted: null, sync_existing: false, requested_by: 'actor1', superadmin: true, attempts: 1, mva_withdraw_idstr: 'HB-1465' }, executeListingAction)).toMatchObject({ ok: true, action: 'withdrawn' });
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });
});
