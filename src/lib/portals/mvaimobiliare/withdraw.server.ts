import type { PublishJobRow, PublishOutcome } from '../publish-jobs.server';
import { isPropertyFeedEligible } from '@/lib/site-feed/mapper';
import type { executeListingAction } from '@/lib/portals.functions';

/** Only the existing publication worker sends API withdrawals; latest intent wins. */
export async function runMvaWithdrawalJob(
  admin: { from: (table: string) => any },
  job: PublishJobRow,
  execute: typeof executeListingAction,
): Promise<PublishOutcome> {
  const [property, publication, connection] = await Promise.all([
    admin.from('properties').select('status,publish_status,deleted_at,development_withdrawn_at')
      .eq('organization_id', job.organization_id).eq('id', job.property_id).maybeSingle(),
    admin.from('portal_publications').select('enabled').eq('organization_id', job.organization_id)
      .eq('property_id', job.property_id).eq('portal_key', 'mvaimobiliare').maybeSingle(),
    admin.from('portal_connections').select('portal_credentials_encrypted').eq('organization_id', job.organization_id)
      .eq('portal', 'mvaimobiliare').maybeSingle(),
  ]);
  if (property.error || publication.error || connection.error || !property.data) {
    return { portalId: 'mvaimobiliare', ok: false, code: 'NETWORK_ERROR', message: 'Datele retragerii mvaimobiliare.ro nu pot fi citite.' };
  }
  if (publication.data?.enabled && isPropertyFeedEligible(property.data) && !property.data.development_withdrawn_at) {
    return { portalId: 'mvaimobiliare', ok: true, action: 'skipped', message: 'Retragere anulată: oferta a fost selectată din nou.' };
  }
  if (!connection.data?.portal_credentials_encrypted) {
    return { portalId: 'mvaimobiliare', ok: false, code: 'CONFIG_ERROR', message: 'Cheia API mvaimobiliare.ro nu mai este salvată.' };
  }
  const result = await execute({
    organizationId: job.organization_id, propertyId: job.property_id, actorId: job.requested_by,
    portalId: 'mvaimobiliare', action: 'withdraw',
    ...(job.mva_withdraw_idstr ? { mvaWithdrawIdstr: job.mva_withdraw_idstr } : {}),
  });
  return result.ok
    ? { portalId: 'mvaimobiliare', ok: true, action: 'withdrawn', message: 'Anunțul a fost retras de pe mvaimobiliare.ro.' }
    : { portalId: 'mvaimobiliare', ok: false, message: result.message, code: result.code,
        httpStatus: result.httpStatus, retryAfterMs: result.retryAfterMs };
}