import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const ORG = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';
const pid = (i: number) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const N = 320;

async function setup(failing: string | null = null) {
  const db = new PGlite();
  const arm = (name: string) => `CREATE FUNCTION ${name}() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    ${failing === name ? "RAISE EXCEPTION 'arm failed';" : `INSERT INTO arm_calls VALUES ('${name}');`} END $$;`;
  await db.exec(`
    CREATE TABLE properties(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE audit_logs(organization_id uuid, actor_id uuid, action text, entity text, entity_id uuid, new_values jsonb);
    CREATE TABLE arm_calls(name text);
    CREATE TABLE portal_publications(organization_id uuid, property_id uuid, portal_key text, enabled boolean, status text,
      withdrawn_at timestamptz, withdraw_reason text, updated_by uuid);
    CREATE TABLE portal_status_withdraw_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, property_id uuid,
      portal_key text, reason text, status text DEFAULT 'queued', attempts int DEFAULT 0, max_attempts int DEFAULT 5, last_error text,
      message text, requested_by uuid, locked_until timestamptz, next_attempt_at timestamptz, created_at timestamptz DEFAULT now(), finished_at timestamptz);
    CREATE TABLE portal_publish_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, property_id uuid, portal_key text,
      enabled boolean, promoted boolean, imobiliare_promotions jsonb, imobiliare_mode text, sync_existing boolean, requested_by uuid,
      superadmin boolean, status text DEFAULT 'queued', operation text DEFAULT 'apply', attempts int DEFAULT 0, locked_at timestamptz,
      next_attempt_at timestamptz DEFAULT now(), contact_update_requested_by uuid, result_ok boolean, result_message text, finished_at timestamptz);
    CREATE UNIQUE INDEX one_active ON portal_publish_jobs(property_id, portal_key) WHERE status IN ('queued','running');
    CREATE TABLE portal_bulk_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, requested_by uuid, status text DEFAULT 'queued',
      total int DEFAULT 0, done int DEFAULT 0, failed int DEFAULT 0, created_at timestamptz DEFAULT now(), finished_at timestamptz);
    CREATE TABLE portal_bulk_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid, property_id uuid, portal_key text, enabled boolean,
      promoted boolean, status text DEFAULT 'queued', message text, finished_at timestamptz, UNIQUE (job_id, property_id, portal_key));
    CREATE FUNCTION enqueue_portal_contact_update(_org uuid, _property uuid, _portal text, _actor uuid, _superadmin boolean, _next timestamptz)
      RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO portal_publish_jobs (organization_id,property_id,portal_key,enabled,sync_existing,requested_by,superadmin,operation,next_attempt_at)
      VALUES (_org,_property,_portal,true,true,_actor,_superadmin,'update',_next)
      ON CONFLICT (property_id,portal_key) WHERE status IN ('queued','running') DO UPDATE SET contact_update_requested_by = _actor; END $$;
    ${arm('portal_publish_arm')} ${arm('portal_status_withdraw_arm')} ${arm('portal_bulk_arm')}
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`);
  await db.exec(readFileSync('drizzle/migrations/0200_atomic_queue_starts.sql', 'utf8'));
  await db.query(`INSERT INTO properties SELECT ('10000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, $1 FROM generate_series(0, ${N - 1}) g`, [ORG]);
  return db;
}
const count = async (db: PGlite, sql: string) => (await db.query<{ c: number }>(`SELECT count(*)::int c FROM ${sql}`)).rows[0].c;
const arms = (db: PGlite, name: string) => count(db, `arm_calls WHERE name = '${name}'`);
const pairs = (n: number) => Array.from({ length: n }, (_, i) => ({ property_id: pid(i), portal_key: 'storia' }));

describe('1. retragerea automată', () => {
  const run = (db: PGlite) => db.query(`SELECT start_status_withdrawals($1,$2,'status_sold',$3,$4)`,
    [ORG, USER, JSON.stringify(pairs(N)), JSON.stringify([{ property_id: pid(0), portal_key: 'manual', message: 'manual' }])]);
  it('salvează toate retragerile și armează workerul', async () => {
    const db = await setup();
    await run(db);
    expect(await count(db, "portal_status_withdraw_items WHERE status = 'queued'")).toBe(N);
    expect(await count(db, "portal_status_withdraw_items WHERE status = 'manual_required'")).toBe(1);
    expect(await arms(db, 'portal_status_withdraw_arm')).toBe(1);
    await run(db); // repetarea nu dublează
    expect(await count(db, "portal_status_withdraw_items WHERE status = 'queued'")).toBe(N);
  });
  it('dacă armarea pică, nu rămâne nimic', async () => {
    const db = await setup('portal_status_withdraw_arm');
    await expect(run(db)).rejects.toThrow(/arm failed/);
    expect(await count(db, 'portal_status_withdraw_items')).toBe(0);
    expect(await count(db, 'audit_logs')).toBe(0);
  });
  it('o retragere blocată de peste 15 minute, fără reîncercări, se închide ca eșuată', async () => {
    const db = await setup();
    await db.query(`INSERT INTO portal_status_withdraw_items(organization_id, property_id, portal_key, reason, status, attempts, locked_until)
      VALUES ($1,$2,'a','status_sold','running',5, now() - interval '16 minutes'), ($1,$2,'b','status_sold','running',2, now() - interval '16 minutes')`, [ORG, pid(1)]);
    expect((await db.query<{ n: number }>('SELECT close_stale_status_withdrawals(NULL) n')).rows[0].n).toBe(1);
    expect((await db.query<{ status: string }>('SELECT status FROM portal_status_withdraw_items ORDER BY portal_key')).rows.map(r => r.status)).toEqual(['failed', 'running']);
  });
});

describe('2. actualizarea contactului', () => {
  const run = (db: PGlite) => db.query('SELECT start_portal_contact_updates($1,$2,false,$3)', [ORG, USER, JSON.stringify(pairs(N))]);
  it('salvează toate actualizările și armează workerul', async () => {
    const db = await setup();
    await run(db);
    expect(await count(db, "portal_publish_jobs WHERE operation = 'update'")).toBe(N);
    expect(await arms(db, 'portal_publish_arm')).toBe(1);
  });
  it('dacă armarea pică, nu rămâne nimic', async () => {
    const db = await setup('portal_publish_arm');
    await expect(run(db)).rejects.toThrow(/arm failed/);
    expect(await count(db, 'portal_publish_jobs')).toBe(0);
  });
});

describe('3. publicarea în masă', () => {
  const run = (db: PGlite) => db.query('SELECT start_portal_bulk_job($1,$2,$3,$4) r', [ORG, USER,
    JSON.stringify(pairs(N).map(p => ({ ...p, enabled: true }))), JSON.stringify([{ property_id: pid(0), portal_key: 'x', enabled: true, message: 'limită' }])]);
  it('lotul, toate anunțurile și armarea, împreună', async () => {
    const db = await setup();
    await run(db);
    expect(await count(db, "portal_bulk_jobs WHERE status = 'queued' AND total = " + (N + 1))).toBe(1);
    expect(await count(db, 'portal_bulk_items')).toBe(N + 1);
    expect(await arms(db, 'portal_bulk_arm')).toBe(1);
  });
  it('dacă armarea pică, nu rămâne nici lotul', async () => {
    const db = await setup('portal_bulk_arm');
    await expect(run(db)).rejects.toThrow(/arm failed/);
    expect(await count(db, 'portal_bulk_jobs')).toBe(0);
    expect(await count(db, 'portal_bulk_items')).toBe(0);
  });
  it('un lot „în curs” fără anunțuri active de peste 15 minute se închide cu totalurile corecte', async () => {
    const db = await setup();
    await db.query(`INSERT INTO portal_bulk_jobs(id, organization_id, status, created_at) VALUES
      ('20000000-0000-4000-8000-000000000001',$1,'running', now() - interval '16 minutes'),
      ('20000000-0000-4000-8000-000000000002',$1,'running', now() - interval '16 minutes'),
      ('20000000-0000-4000-8000-000000000003',$1,'running', now() - interval '5 minutes')`, [ORG]);
    await db.query(`INSERT INTO portal_bulk_items(job_id, property_id, portal_key, enabled, status) VALUES
      ('20000000-0000-4000-8000-000000000001',$1,'a',true,'ok'), ('20000000-0000-4000-8000-000000000001',$1,'b',true,'failed'),
      ('20000000-0000-4000-8000-000000000002',$1,'a',true,'queued')`, [pid(1)]);
    expect((await db.query<{ n: number }>('SELECT close_stale_portal_bulk_jobs(NULL) n')).rows[0].n).toBe(1);
    const rows = (await db.query<{ status: string; done: number; failed: number }>('SELECT status, done, failed FROM portal_bulk_jobs ORDER BY id')).rows;
    expect(rows).toEqual([{ status: 'done', done: 1, failed: 1 }, { status: 'running', done: 0, failed: 0 }, { status: 'running', done: 0, failed: 0 }]);
  });
});

describe('4. publicarea din pagina proprietății', () => {
  const jobs = JSON.stringify(['storia', 'vdi', 'imobiliare_ro'].map(portal_key => ({ portal_key, enabled: true })));
  const run = (db: PGlite) => db.query<{ k: string[] }>('SELECT start_portal_publish_jobs($1,$2,$3,false,true,$4) k', [ORG, pid(3), USER, jobs]);
  it('toate portalurile și armarea; un portal ocupat e raportat, nu dublat', async () => {
    const db = await setup();
    await db.query("INSERT INTO portal_publish_jobs(property_id, portal_key, status) VALUES ($1,'vdi','running')", [pid(3)]);
    const keys = (await run(db)).rows[0].k;
    expect(keys.sort()).toEqual(['imobiliare_ro', 'storia']);
    expect(await arms(db, 'portal_publish_arm')).toBe(1);
  });
  it('dacă armarea pică, nu rămâne niciun job', async () => {
    const db = await setup('portal_publish_arm');
    await expect(run(db)).rejects.toThrow(/arm failed/);
    expect(await count(db, 'portal_publish_jobs')).toBe(0);
  });
  it('un job blocat de peste 15 minute, fără reîncercări, se închide cu eroare', async () => {
    const db = await setup();
    await db.query(`INSERT INTO portal_publish_jobs(organization_id, property_id, portal_key, status, attempts, locked_at) VALUES
      ($1,$2,'a','running',4, now() - interval '16 minutes'), ($1,$2,'b','running',1, now() - interval '16 minutes')`, [ORG, pid(4)]);
    expect((await db.query<{ n: number }>('SELECT close_stale_portal_publish_jobs(NULL) n')).rows[0].n).toBe(1);
    expect((await db.query<{ status: string }>('SELECT status FROM portal_publish_jobs ORDER BY portal_key')).rows.map(r => r.status)).toEqual(['error', 'running']);
  });
});
