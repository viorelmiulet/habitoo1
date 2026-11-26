import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { runMvaInitialSyncTick, startMvaInitialSync, mvaCredentialHash, markMvaAuthError, runMvaInitialPublishJob, type MvaSyncRun, type MvaSyncDeps } from './sync.server';
import { fakeMvaDb } from './test-db';
import { getPortalDefinition } from '../registry';
import { runPortalPublishWorker, type PublishJobRow } from '../publish-jobs.server';
const ORG = 'org-fixture';
const KEY = 'fictitious-mva-key';
vi.mock('../crypto.server', () => ({ decryptPortalCredential: (cipher: string) => cipher === 'fixture-encrypted' ? KEY : null }));
const definition = getPortalDefinition('mvaimobiliare');
if (!definition) throw new Error('Missing definition');
const ctx = { organizationId: ORG, definition, direction: 'habitoo_to_portal' as const, authenticationMode: 'portal_api_key' as const, externalAccountId: null, portalCredential: KEY, settings: {}, allowLiveRequests: true };
let db = fakeMvaDb();
let run: MvaSyncRun;
let deps: MvaSyncDeps;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('No real portal calls permitted'); }));
  run = { id: 'sync1', organization_id: ORG, credential_hash: mvaCredentialHash(KEY), claim_token: 'token1', phase: 'waiting', page: 1, remote_total: null, remote_listings: [], withdrawal_cursor: 0, withdrawn: 0, attempts: 0 };
  db = fakeMvaDb({
    mva_initial_syncs: [run],
    portal_connections: [{ organization_id: ORG, portal: 'mvaimobiliare', portal_credentials_encrypted: 'fixture-encrypted', settings: { allow_live: true }, activated: true, status: 'connected' }],
    properties: [{ id: 'p1', organization_id: ORG, reference: 'HB-1', status: 'active', publish_status: 'published', deleted_at: null }, { id: 'p2', organization_id: ORG, reference: 'HB-2', deleted_at: null }, { id: 'other', organization_id: 'other-org', reference: 'HB-other' }],
    portal_publications: [{ organization_id: ORG, portal_key: 'mvaimobiliare', property_id: 'p1', enabled: true }, { organization_id: ORG, portal_key: 'mvaimobiliare', property_id: 'p2', enabled: true }, { organization_id: 'other-org', portal_key: 'mvaimobiliare', property_id: 'other', enabled: true }],
    notifications: [],
  });
  db.rpc = vi.fn(async (name: string) => {
    if (name === 'claim_mva_initial_sync') return { data: ['done', 'error'].includes(run.phase) ? [] : [{ ...run }], error: null };
    if (name === 'finish_mva_initial_sync') {
      if (!['done', 'error'].includes(run.phase)) { run.phase = 'done'; db.rows['notifications']?.push({ portal: 'mvaimobiliare' }); }
      return { data: true, error: null };
    }
    return { data: null, error: null };
  });
  deps = {
    context: vi.fn(async () => ctx), now: () => 1000,
    readPage: vi.fn(async () => ({ ok: true as const, data: { data: [], page: 1, last_page: 1, total: 0 } })),
    withdraw: vi.fn(async () => ({ ok: true as const, data: { status: 'withdrawn' } })),
  };
});
afterEach(() => vi.unstubAllGlobals());
describe('sincronizarea mvaimobiliare.ro în worker', () => {
  it('parcurge toate paginile înainte de DELETE și retrage numai ofertele care nu mai sunt bifate', async () => {
    const listing = (idstr: string) => ({ idstr, is_published: true, url: null, updated_at: '2026-11-26' });
    deps.readPage = vi.fn<MvaSyncDeps["readPage"]>(async (_ctx, page) => ({ ok: true as const, data: { data: page === 1 ? [listing('HB-1'), listing('stale')] : [listing('HB-2'), listing('HB-other')], page, last_page: 2, total: 4 } }));
    await runMvaInitialSyncTick(db, deps);
    await runMvaInitialSyncTick(db, deps);
    expect(deps.withdraw).not.toHaveBeenCalled();
    for (let i = 0; i < 6; i++) await runMvaInitialSyncTick(db, deps);
    expect((deps.withdraw as ReturnType<typeof vi.fn>).mock.calls.map(c => c[1])).toEqual(['stale', 'HB-other']);
    expect(run.withdrawn).toBe(2);
    expect(db.rows['notifications']).toHaveLength(1);
    expect(run.phase).toBe('done');
  });
  it('sare toate unitățile bifate într-o singură trecere locală, nu câte una pe minut', async () => {
    run.phase = 'withdrawing';
    run.remote_listings = Array.from({ length: 85 }, (_, i) => ({ idstr: `HB-${i}`, is_published: true, url: null, updated_at: '' }));
    db.rows['properties'] = run.remote_listings.map((p, i) => ({ id: `p${i}`, organization_id: ORG, reference: p.idstr, deleted_at: null }));
    db.rows['portal_publications'] = run.remote_listings.map((_p, i) => ({ property_id: `p${i}`, organization_id: ORG, portal_key: 'mvaimobiliare', enabled: true }));
    await runMvaInitialSyncTick(db, deps);
    expect(run.withdrawal_cursor).toBe(85);
    expect(deps.withdraw).not.toHaveBeenCalled();
  });
  it('reverifică bifele la retragere: o ofertă bifată după inventariere este păstrată', async () => {
    run.phase = 'withdrawing'; run.remote_listings = [{ idstr: 'HB-new', is_published: true, url: null, updated_at: '' }];
    db.rows['properties']?.push({ id: 'new', organization_id: ORG, reference: 'HB-new', deleted_at: null });
    db.rows['portal_publications']?.push({ property_id: 'new', organization_id: ORG, portal_key: 'mvaimobiliare', enabled: true });
    await runMvaInitialSyncTick(db, deps);
    expect(deps.withdraw).not.toHaveBeenCalled();
    expect(run.withdrawal_cursor).toBe(1);
  });
  it('agenția fără cheie nu face apeluri API', async () => {
    deps.context = vi.fn(async () => null);
    await runMvaInitialSyncTick(db, deps);
    expect(deps.readPage).not.toHaveBeenCalled(); expect(deps.withdraw).not.toHaveBeenCalled();
  });
  it('o citire incompletă sau un inventar schimbat nu provoacă retrageri', async () => {
    deps.readPage = vi.fn(async () => ({ ok: true as const, data: { data: [], page: 1, last_page: 1, total: 20 } }));
    await runMvaInitialSyncTick(db, deps);
    expect(deps.withdraw).not.toHaveBeenCalled();
    expect(run.phase).not.toBe('withdrawing');
  });
  it('429 la retragere păstrează cursorul pentru aceeași încercare idempotentă', async () => {
    run.phase = 'withdrawing'; run.remote_listings = [{ idstr: 'stale', is_published: true, url: null, updated_at: '' }];
    deps.withdraw = vi.fn<MvaSyncDeps["withdraw"]>(async () => ({ ok: false as const, code: 'RATE_LIMIT', httpStatus: 429, message: 'Prea multe cereri', retryAfterMs: 300_000 }));
    await runMvaInitialSyncTick(db, deps);
    expect(run.withdrawal_cursor).toBe(0); expect(run.attempts).toBe(1);
    expect(db.rows['mva_initial_syncs']?.[0]?.['next_attempt_at']).toBe(new Date(301_000).toISOString());
  });
  it('401 marchează conexiunea cu eroare de cheie', async () => {
    await markMvaAuthError(db, ORG, { ok: false, code: 'AUTH_ERROR', httpStatus: 401, message: 'Cheie refuzată' });
    expect(db.rows['portal_connections']?.[0]).toMatchObject({ status: 'error', last_sync_status: 'error', last_sync_error: 'Cheie refuzată' });
  });
  it('înscrierea trimite numai amprenta cheii și valoarea deja criptată', async () => {
    const rpc = vi.fn(async () => ({ data: 'sync1', error: null })); db.rpc = rpc;
    expect(await startMvaInitialSync(db, { organizationId: ORG, actorId: 'actor1', credential: KEY, encrypted: 'fixture-encrypted' })).toBe('sync1');
    expect(rpc).toHaveBeenCalledWith('start_mva_initial_sync', { _org: ORG, _actor: 'actor1', _hash: mvaCredentialHash(KEY), _encrypted: 'fixture-encrypted' });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(KEY);
  });
  it('publicarea din coada existentă reverifică bifa și nu publică oferte debifate', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const job: PublishJobRow = { id: 'j1', organization_id: ORG, property_id: 'p1', portal_key: 'mvaimobiliare', enabled: true, promoted: null, sync_existing: true, requested_by: 'actor1', superadmin: false, attempts: 1, mva_sync_id: run.id };
    expect(await runMvaInitialPublishJob(db, job, execute)).toMatchObject({ ok: true, action: 'published' });
    expect(execute).toHaveBeenCalledWith({ organizationId: ORG, actorId: 'actor1', portalId: 'mvaimobiliare', propertyId: 'p1', action: 'publish', skipSlotCheck: true, suppressFailureNotification: true });
    const publication = db.rows['portal_publications']?.[0]; if (!publication) throw new Error('Missing publication'); publication['enabled'] = false;
    expect(await runMvaInitialPublishJob(db, job, execute)).toMatchObject({ ok: true, action: 'skipped' });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('anunțurile ocupate sunt puse în coadă înainte de citirea inventarului', async () => {
    run.pending_property_ids = ['p1'];
    await runMvaInitialSyncTick(db, deps);
    expect(db.rpc).toHaveBeenCalledWith('enqueue_mva_initial_pending', { _id: run.id, _token: run.claim_token });
    expect(deps.readPage).not.toHaveBeenCalled();
  });
  it('workerul existent nu produce notificări pe fiecare eroare din sincronizare', async () => {
    const job: PublishJobRow = { id: 'j1', organization_id: ORG, property_id: 'p1', portal_key: 'mvaimobiliare', enabled: true, promoted: null, sync_existing: true, requested_by: 'actor1', superadmin: false, attempts: 1, mva_sync_id: run.id };
    let claimed = false;
    db.rows['portal_publish_jobs'] = [{ ...job, status: 'queued' }];
    db.rpc = vi.fn(async name => { if (name === 'claim_portal_publish_jobs' && !claimed) { claimed = true; return { data: [job], error: null }; } return { data: [], error: null }; });
    await runPortalPublishWorker(db, async () => ({ portalId: 'mvaimobiliare', ok: false, code: 'AUTH_ERROR', message: 'Cheie refuzată' }), { concurrency: 1 });
    expect(db.rows['portal_publish_jobs']?.[0]?.['status']).toBe('error');
    expect(db.rows['notifications']).toHaveLength(0);
  });
});
