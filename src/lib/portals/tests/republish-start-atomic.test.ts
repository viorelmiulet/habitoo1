import { expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { republishStartArgs, staggerRepublishPairs } from '@/lib/portals/republish';

const ORG = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';
const pid = (i: number) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

async function setup(armFails = false) {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE properties(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE portal_republish_batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, requested_by uuid,
      scope text, kind text DEFAULT 'republish', portal_keys text[] DEFAULT '{}', status text DEFAULT 'running', total int DEFAULT 0,
      succeeded int DEFAULT 0, failed int DEFAULT 0, skipped int DEFAULT 0, skipped_items jsonb DEFAULT '[]', created_at timestamptz DEFAULT now(), finished_at timestamptz);
    CREATE TABLE portal_publish_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, property_id uuid, portal_key text,
      enabled boolean, promoted boolean, sync_existing boolean, requested_by uuid, superadmin boolean, status text DEFAULT 'queued',
      operation text, republish_batch_id uuid, next_attempt_at timestamptz, result_action text);
    CREATE UNIQUE INDEX one_active ON portal_publish_jobs(property_id, portal_key) WHERE status IN ('queued','running');
    CREATE TABLE audit_logs(organization_id uuid, actor_id uuid, action text, entity text, entity_id uuid, new_values jsonb);
    CREATE TABLE arm_calls(n int);
    CREATE FUNCTION portal_publish_arm() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      ${armFails ? "RAISE EXCEPTION 'arm failed';" : 'INSERT INTO arm_calls VALUES (1);'} END $$;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`);
  await db.exec(readFileSync('drizzle/migrations/0199_atomic_republish_start.sql', 'utf8'));
  for (let i = 0; i < 333; i++) await db.query('INSERT INTO properties VALUES($1,$2)', [pid(i), ORG]);
  return db;
}

function call(db: PGlite, count: number) {
  const pairs = staggerRepublishPairs(Array.from({ length: count }, (_, i) => ({ propertyId: pid(i), portalId: 'storia' })), Date.now());
  const a = republishStartArgs({ organizationId: ORG, userId: USER, scope: 'all', portalKeys: [], kind: 'republish', operation: 'republish',
    superadmin: false, syncExisting: true, skippedItems: [{ propertyId: pid(0), portalId: 'imove', message: 'auto' }], pairs, busyMessage: 'busy' });
  return db.query<{ r: any }>(`SELECT start_portal_republish_batch($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r`,
    [a._org, a._requested_by, a._scope, a._portal_keys, a._kind, a._operation, a._superadmin, a._sync_existing,
     JSON.stringify(a._skipped_items), JSON.stringify(a._pairs), a._busy_message]);
}

it('333 pairs: one call creates the batch, every job and arms the worker', async () => {
  const db = await setup();
  const res = (await call(db, 333)).rows[0].r;
  expect(res.queued).toBe(333);
  expect((await db.query<any>('SELECT count(*)::int c FROM portal_publish_jobs WHERE republish_batch_id=$1', [res.batch_id])).rows[0].c).toBe(333);
  expect((await db.query<any>('SELECT total FROM portal_republish_batches')).rows[0].total).toBe(334);
  expect((await db.query<any>('SELECT count(*)::int c FROM arm_calls')).rows[0].c).toBe(1);
  await expect(call(db, 10)).rejects.toThrow(/republish_running/);
  await db.close();
});

it('a failure leaves nothing half-done', async () => {
  const db = await setup(true);
  await expect(call(db, 333)).rejects.toThrow(/arm failed/);
  expect((await db.query<any>('SELECT count(*)::int c FROM portal_publish_jobs')).rows[0].c).toBe(0);
  expect((await db.query<any>('SELECT count(*)::int c FROM portal_republish_batches')).rows[0].c).toBe(0);
  await db.close();
});

it('busy pairs are skipped, not failed', async () => {
  const db = await setup();
  await db.query("INSERT INTO portal_publish_jobs(property_id, portal_key, status) VALUES($1,'storia','running')", [pid(5)]);
  const res = (await call(db, 20)).rows[0].r;
  expect(res).toMatchObject({ queued: 19, busy: 1 });
  expect((await db.query<any>('SELECT skipped FROM portal_republish_batches')).rows[0].skipped).toBe(2);
  await db.close();
});

it('a running batch idle for over 15 minutes closes itself; a younger one or one with queued jobs does not', async () => {
  const db = await setup();
  await db.exec(`INSERT INTO portal_republish_batches(id, organization_id, created_at) VALUES
    ('20000000-0000-4000-8000-000000000001','${ORG}', now() - interval '16 minutes'),
    ('20000000-0000-4000-8000-000000000002','${ORG}', now() - interval '5 minutes'),
    ('20000000-0000-4000-8000-000000000003','${ORG}', now() - interval '3 hours');
    INSERT INTO portal_publish_jobs(property_id, portal_key, status, republish_batch_id) VALUES ('${pid(1)}','x','queued','20000000-0000-4000-8000-000000000003');
    INSERT INTO portal_publish_jobs(property_id, portal_key, status, result_action, republish_batch_id) VALUES ('${pid(2)}','x','done','republished','20000000-0000-4000-8000-000000000001');`);
  expect((await db.query<any>('SELECT close_stale_republish_batches(NULL) n')).rows[0].n).toBe(1);
  const rows = (await db.query<any>('SELECT id, status, succeeded FROM portal_republish_batches ORDER BY id')).rows;
  expect(rows.map((r: any) => r.status)).toEqual(['done', 'running', 'running']);
  expect(rows[0].succeeded).toBe(1);
  await db.close();
});
