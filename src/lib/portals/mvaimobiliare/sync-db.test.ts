import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
let pg: PGlite;
const org = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const p1 = '44444444-4444-4444-8444-444444444441';
const p2 = '44444444-4444-4444-8444-444444444442';
let additiveVerified = false;
async function start(hash = 'hash1', encrypted = 'fixture-encrypted') {
  const result = await pg.query<{ id: string | null }>('select public.start_mva_initial_sync($1,$2,$3,$4) as id', [org, actor, hash, encrypted]);
  return result.rows[0]?.id ?? null;
}
async function count(table: string) { return (await pg.query<{ count: number }>(`select count(*)::int as count from public.${table}`)).rows[0]?.count; }
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA cron;
    CREATE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.properties(id uuid PRIMARY KEY, organization_id uuid REFERENCES public.organizations(id), deleted_at timestamptz, reference text);
    CREATE TABLE public.portal_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,portal text,activated boolean,portal_credentials_encrypted text);
    CREATE TABLE public.portal_publications(property_id uuid,organization_id uuid,portal_key text,enabled boolean);
    CREATE TABLE public.portal_publish_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,property_id uuid,portal_key text,enabled boolean,sync_existing boolean,requested_by uuid,superadmin boolean,operation text,status text DEFAULT 'queued',next_attempt_at timestamptz DEFAULT now(),contact_update_requested_by uuid,result_action text,result_ok boolean);
    CREATE UNIQUE INDEX portal_publish_jobs_one_active ON public.portal_publish_jobs(property_id,portal_key) WHERE status IN ('queued','running');
    CREATE TABLE public.storia_development_jobs(status text);
    CREATE TABLE public.notifications(organization_id uuid,user_id uuid,created_by uuid,type text,title text,body text,link text);
    CREATE TABLE public.arm_calls(n integer);
    CREATE FUNCTION public.portal_publish_arm() RETURNS void LANGUAGE sql AS $$ INSERT INTO public.arm_calls VALUES(1) $$;
    CREATE FUNCTION public.portal_publish_kick() RETURNS void LANGUAGE sql AS $$ SELECT $$;
    INSERT INTO public.organizations VALUES('${org}');
    INSERT INTO public.properties VALUES('${p1}','${org}',null,'HB-1');
    INSERT INTO public.portal_connections(organization_id,portal,activated,portal_credentials_encrypted) VALUES('${org}','mvaimobiliare',true,'fixture-encrypted');`);
  const before = await pg.query('select * from public.portal_connections');
  await pg.exec(readFileSync('drizzle/migrations/0347_mva_initial_api_sync.sql', 'utf8'));
  await pg.exec(readFileSync('drizzle/migrations/0348_mva_initial_sync_pending_jobs.sql', 'utf8'));
  const after = await pg.query('select * from public.portal_connections');
  additiveVerified = JSON.stringify(before.rows) === JSON.stringify(after.rows) && await count('properties') === 1 && await count('mva_initial_syncs') === 0;
}, 15000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec(`TRUNCATE public.portal_publish_jobs,public.mva_initial_syncs,public.portal_publications,public.portal_connections,public.properties,public.organizations,public.notifications,public.arm_calls CASCADE;
    INSERT INTO public.organizations VALUES('${org}'),('${other}');
    INSERT INTO public.properties VALUES('${p1}','${org}',null,'HB-1'),('${p2}','${org}',null,'HB-2'),('44444444-4444-4444-8444-444444444443','${org}',null,'HB-3'),('44444444-4444-4444-8444-444444444444','${other}',null,'HB-other'),('44444444-4444-4444-8444-444444444445','${org}',now(),'HB-deleted');
    INSERT INTO public.portal_publications VALUES('${p1}','${org}','mvaimobiliare',true),('${p2}','${org}','mvaimobiliare',true),('44444444-4444-4444-8444-444444444443','${org}','mvaimobiliare',false),('44444444-4444-4444-8444-444444444444','${other}','mvaimobiliare',true),('44444444-4444-4444-8444-444444444445','${org}','mvaimobiliare',true);
    INSERT INTO public.portal_connections(organization_id,portal,activated,portal_credentials_encrypted) VALUES('${org}','mvaimobiliare',true,'fixture-encrypted');`);
});
describe('tranzacțiile sincronizării inițiale — PostgreSQL local', () => {
  it('migrările sunt aditive și nu modifică rândurile existente', () => { expect(additiveVerified).toBe(true); });
  it('prima cheie pune în coada existentă numai anunțurile bifate, neșterse, ale agenției', async () => {
    expect(await start()).not.toBeNull();
    const jobs = await pg.query<{ property_id: string; mva_sync_id: string; enabled: boolean }>('select property_id,mva_sync_id,enabled from public.portal_publish_jobs order by property_id');
    expect(jobs.rows.map(r => r.property_id)).toEqual([p1, p2]);
    expect(jobs.rows.every(r => r.enabled && r.mva_sync_id)).toBe(true);
    expect(await count('arm_calls')).toBe(1);
  });
  it('aceeași cheie pornește o singură dată; o cheie nouă are propriul jurnal', async () => {
    const first = await start();
    expect(await start()).toBeNull();
    expect(await count('portal_publish_jobs')).toBe(2);
    expect(await count('mva_initial_syncs')).toBe(1);
    expect(await start('hash2')).not.toBe(first);
    expect(await count('mva_initial_syncs')).toBe(2);
  });
  it('cheia schimbată înainte de înscriere refuză atomic, fără jurnal sau joburi', async () => {
    await expect(start('hash1', 'wrong-encrypted')).rejects.toThrow('Conexiunea mvaimobiliare.ro s-a schimbat');
    expect(await count('mva_initial_syncs')).toBe(0);
    expect(await count('portal_publish_jobs')).toBe(0);
  });
  it('nu citește inventarul până când publicările s-au terminat; lease-ul împiedică două procesări', async () => {
    await start();
    expect((await pg.query('select * from public.claim_mva_initial_sync()')).rows).toHaveLength(0);
    await pg.exec("update public.portal_publish_jobs set status='done',result_action='published'");
    expect((await pg.query('select * from public.claim_mva_initial_sync()')).rows).toHaveLength(1);
    expect((await pg.query('select * from public.claim_mva_initial_sync()')).rows).toHaveLength(0);
  });
  it('anunțul deja în lucru este reluat după operația existentă, fără pierderi sau duplicate', async () => {
    await pg.exec(`insert into public.portal_publish_jobs(organization_id,property_id,portal_key,status) values('${org}','${p1}','mvaimobiliare','running')`);
    const id = await start();
    expect((await pg.query<{ pending_property_ids: string[] }>('select pending_property_ids from public.mva_initial_syncs')).rows[0]?.pending_property_ids).toEqual([p1]);
    await pg.exec("update public.portal_publish_jobs set status='done',result_action='published'");
    const claim = (await pg.query<{ claim_token: string }>('select * from public.claim_mva_initial_sync()')).rows[0];
    if (!claim) throw new Error('Missing claim');
    const requeued = await pg.query<{ n: number }>('select public.enqueue_mva_initial_pending($1,$2) as n', [id, claim.claim_token]);
    expect(requeued.rows[0]?.n).toBe(1);
    const linked = await pg.query<{ property_id: string }>('select property_id from public.portal_publish_jobs where mva_sync_id=$1 order by property_id', [id]);
    expect(linked.rows.map(r => r.property_id)).toEqual([p1, p2]);
  });
  it('finalizarea creează exact o notificare, inclusiv la două cereri de finalizare', async () => {
    const id = await start();
    await pg.exec("update public.portal_publish_jobs set status='done',result_action='published'");
    const claim = (await pg.query<{ claim_token: string }>('select * from public.claim_mva_initial_sync()')).rows[0];
    if (!claim) throw new Error('Missing claim');
    await pg.query('update public.mva_initial_syncs set withdrawn=2 where id=$1', [id]);
    await pg.query('select public.finish_mva_initial_sync($1,$2,null)', [id, claim.claim_token]);
    await pg.query('select public.finish_mva_initial_sync($1,$2,null)', [id, claim.claim_token]);
    expect(await count('notifications')).toBe(1);
    const notification = (await pg.query<{ title: string; body: string }>('select title,body from public.notifications')).rows[0];
    expect(notification?.body).toContain('2 publicate, 2 retrase');
  });
});
