import { createHash } from 'node:crypto';
import type { PortalContext, PortalFail } from '../adapter';
import { getPortalDefinition } from '../registry';
import { decryptPortalCredential } from '../crypto.server';
import { readCompleteRows } from '@/lib/site-feed/complete-read.server';
import { isPropertyFeedEligible } from '@/lib/site-feed/mapper';
import { readMvaPage, deleteMvaListing, type MvaRemotePage } from '../adapters/mvaimobiliare.server';
import { isTransientPublishFailure, publishRetryDelayFor } from '../transient-failure';
import type { PublishJobRow } from '../publish-jobs.server';

// Server-only DB interface, shared by real operations and in-memory tests.
// Matches the existing queue workers; the generated client has overloaded table/RPC names.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
export const mvaCredentialHash = (key: string) => createHash('sha256').update(key.trim()).digest('hex');
export async function startMvaInitialSync(admin: Admin, input: { organizationId: string; actorId: string; credential: string; encrypted: string }) {
  const { data, error } = await admin.rpc('start_mva_initial_sync', { _org: input.organizationId, _actor: input.actorId, _hash: mvaCredentialHash(input.credential), _encrypted: input.encrypted });
  if (error) throw new Error('Sincronizarea inițială mvaimobiliare.ro nu a putut fi pornită. Repetă testul conexiunii.');
  return data as string | null;
}
export async function markMvaAuthError(admin: Admin, organizationId: string, failure: PortalFail) {
  if (failure.code !== 'AUTH_ERROR') return;
  await admin.from('portal_connections').update({ status: 'error', last_sync_status: 'error', last_sync_error: failure.message }).eq('organization_id', organizationId).eq('portal', 'mvaimobiliare');
}
async function contextFor(admin: Admin, organizationId: string): Promise<PortalContext | null> {
  const { data, error } = await admin.from('portal_connections').select('*').eq('organization_id', organizationId).eq('portal', 'mvaimobiliare').maybeSingle();
  if (error) throw new Error('Conexiunea nu poate fi citită.');
  const definition = getPortalDefinition('mvaimobiliare');
  if (!definition || !data?.activated || !data.portal_credentials_encrypted) return null;
  const credential = decryptPortalCredential(data.portal_credentials_encrypted);
  return { organizationId, definition, direction: 'habitoo_to_portal', authenticationMode: 'portal_api_key', externalAccountId: null, portalCredential: credential, settings: data.settings ?? {}, allowLiveRequests: data.settings?.allow_live === true };
}
export async function runMvaInitialPublishJob(admin: Admin, job: PublishJobRow, execute: (input: { organizationId: string; actorId: string; portalId: string; propertyId: string; action: 'publish'; skipSlotCheck: true; suppressFailureNotification: true }) => Promise<any>) {
  const [property, publication, run, ctx] = await Promise.all([
    admin.from('properties').select('id,status,publish_status,deleted_at').eq('organization_id', job.organization_id).eq('id', job.property_id).maybeSingle(),
    admin.from('portal_publications').select('enabled').eq('organization_id', job.organization_id).eq('portal_key', 'mvaimobiliare').eq('property_id', job.property_id).maybeSingle(),
    admin.from('mva_initial_syncs').select('credential_hash').eq('id', job.mva_sync_id).eq('organization_id', job.organization_id).maybeSingle(),
    contextFor(admin, job.organization_id),
  ]);
  if (property.error || publication.error || run.error) return { portalId: 'mvaimobiliare', ok: false, code: 'PORTAL_ERROR', message: 'Datele sincronizării nu pot fi citite complet.' };
  if (!property.data || !isPropertyFeedEligible(property.data) || !publication.data?.enabled || !ctx?.allowLiveRequests || !ctx.portalCredential || mvaCredentialHash(ctx.portalCredential) !== run.data?.credential_hash) {
    return { portalId: 'mvaimobiliare', ok: true, action: 'skipped', message: 'Sărit: anunțul nu mai este bifat/publicabil sau cheia s-a schimbat.' };
  }
  const result = await execute({ organizationId: job.organization_id, actorId: job.requested_by, portalId: 'mvaimobiliare', propertyId: job.property_id, action: 'publish', skipSlotCheck: true, suppressFailureNotification: true });
  return { ...result, portalId: 'mvaimobiliare', action: result.ok ? 'published' : 'blocked' };
}
export type MvaSyncRun = { id: string; organization_id: string; credential_hash: string; claim_token: string; phase: string; page: number; remote_total: number | null; remote_listings: MvaRemotePage['data']; withdrawal_cursor: number; withdrawn: number; attempts: number; pending_property_ids?: string[] };
export type MvaSyncDeps = { context: (org: string) => Promise<PortalContext | null>; readPage: typeof readMvaPage; withdraw: typeof deleteMvaListing; now: () => number };
export async function runMvaInitialSyncTick(admin: Admin, injected?: MvaSyncDeps) {
  const { data, error } = await admin.rpc('claim_mva_initial_sync');
  if (error) throw new Error('Sincronizarea mvaimobiliare.ro nu poate fi preluată.');
  const run = (data as MvaSyncRun[] | null)?.[0];
  if (!run) return;
  const deps = injected ?? { context: (org: string) => contextFor(admin, org), readPage: readMvaPage, withdraw: deleteMvaListing, now: Date.now };
  const finish = async (message: string | null) => {
    const result = await admin.rpc('finish_mva_initial_sync', { _id: run.id, _token: run.claim_token, _error: message });
    if (result.error) throw new Error('Finalizarea sincronizării nu poate fi salvată.');
  };
  const save = async (patch: Record<string, unknown>) => {
    const result = await admin.from('mva_initial_syncs').update({ ...patch, locked_until: null }).eq('id', run.id).eq('claim_token', run.claim_token);
    if (result.error) throw new Error('Progresul sincronizării nu poate fi salvat.');
  };
  const fail = async (failure: PortalFail) => {
    await markMvaAuthError(admin, run.organization_id, failure);
    const attempts = run.attempts + 1;
    const delay = isTransientPublishFailure({ ...failure, portalId: 'mvaimobiliare' }) ? publishRetryDelayFor({ attemptNumber: attempts, retryAfterMs: failure.retryAfterMs }) : null;
    if (delay === null) await finish(failure.message);
    else await save({ attempts, last_error: failure.message, next_attempt_at: new Date(deps.now() + delay).toISOString() });
  };
  try {
    const ctx = await deps.context(run.organization_id);
    if (!ctx?.portalCredential || mvaCredentialHash(ctx.portalCredential) !== run.credential_hash) return await finish('Sincronizarea a fost oprită: cheia agenției s-a schimbat.');
    if (!ctx.allowLiveRequests) return await finish('Sincronizarea a fost oprită: apelurile către portal sunt dezactivate.');
    if (run.phase === 'waiting' && (run.pending_property_ids?.length ?? 0) > 0) {
      const queued = await admin.rpc('enqueue_mva_initial_pending', { _id: run.id, _token: run.claim_token });
      if (queued.error) throw new Error('Publicările amânate nu pot fi puse în coadă.');
      return;
    }
    if (run.phase === 'waiting' || run.phase === 'scanning') {
      const result = await deps.readPage(ctx, run.page);
      if (!result.ok) return await fail(result);
      const page = result.data;
      const rows = [...run.remote_listings, ...page.data];
      if ((run.remote_total !== null && run.remote_total !== page.total) || new Set(rows.map(r => r.idstr)).size !== rows.length || (page.page === page.last_page && rows.length !== page.total)) {
        return await fail({ ok: false, code: 'PORTAL_ERROR', message: 'mvaimobiliare.ro: inventarul s-a schimbat în timpul citirii; nu s-a retras niciun anunț.' });
      }
      await save({ phase: page.page === page.last_page ? 'withdrawing' : 'scanning', page: run.page + 1, remote_listings: rows, remote_total: page.total, attempts: 0, last_error: null });
      return;
    }
    const remote = run.remote_listings[run.withdrawal_cursor];
    if (!remote) return await finish(null);
    // Recheck all saved selections immediately before each DELETE; a partial DB read must never withdraw anything.
    const selected = await readCompleteRows<{ property_id: string }>((from, to) => admin.from('portal_publications').select('property_id').eq('organization_id', run.organization_id).eq('portal_key', 'mvaimobiliare').eq('enabled', true).order('property_id').range(from, to));
    const ids = selected.map(p => p.property_id);
    const refs: { id: string; reference: string | null }[] = [];
    for (let offset = 0; offset < ids.length; offset += 200) {
      refs.push(...await readCompleteRows<{ id: string; reference: string | null }>((from, to) => admin.from('properties').select('id,reference').eq('organization_id', run.organization_id).is('deleted_at', null).in('id', ids.slice(offset, offset + 200)).order('id').range(from, to)));
    }
    const keep = new Set(refs.map(p => p.reference ?? p.id));
    let withdrawn = run.withdrawn;
    let cursor = run.withdrawal_cursor;
    // Skip the entire selected/inactive prefix locally; bound external work to one DELETE per invocation.
    while (cursor < run.remote_listings.length) {
      const listing = run.remote_listings[cursor];
      if (!listing) break;
      if (listing.is_published && !keep.has(listing.idstr)) {
        const result = await deps.withdraw(ctx, listing.idstr);
        if (!result.ok) return await fail(result);
        if (result.data.status !== 'withdrawn') return await fail({ ok: false, code: 'PORTAL_ERROR', message: 'mvaimobiliare.ro nu a confirmat retragerea anunțului.' });
        withdrawn++;
        cursor++;
        break;
      }
      cursor++;
    }
    await save({ withdrawal_cursor: cursor, withdrawn, attempts: 0, last_error: null });
  } catch {
    // Never echo exceptions from credentials, provider responses or DB clients.
    await fail({ ok: false, code: 'PORTAL_ERROR', message: 'mvaimobiliare.ro: eroare temporară la sincronizare. Se reîncearcă mai târziu.' });
  }
}
