import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROP = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const migration = readFileSync(new URL('../../../../drizzle/migrations/0350_mva_durable_withdrawals.sql', import.meta.url), 'utf8');
const snapshotMigration = readFileSync(new URL('../../../../drizzle/migrations/0351_mva_withdraw_queue_snapshot.sql', import.meta.url), 'utf8');
const setup = `
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE properties(id uuid PRIMARY KEY, organization_id uuid, reference text, status text, publish_status text, deleted_at timestamptz, development_withdrawn_at timestamptz, created_by uuid, assigned_to uuid, updated_by uuid);
    CREATE TABLE portal_connections(organization_id uuid, portal text, portal_credentials_encrypted text);
    CREATE TABLE portal_publications(organization_id uuid, property_id uuid, portal_key text, enabled boolean, external_ref text, updated_by uuid, created_by uuid);
    CREATE TABLE portal_listings(organization_id uuid, property_id uuid, portal text, external_id text, status text);
    CREATE TABLE portal_publish_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, property_id uuid, portal_key text, enabled boolean, sync_existing boolean, requested_by uuid NOT NULL, superadmin boolean, operation text, promoted boolean, status text DEFAULT 'queued', attempts integer DEFAULT 0, next_attempt_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX active_jobs ON portal_publish_jobs(property_id,portal_key) WHERE status IN ('queued','running');
    CREATE FUNCTION portal_publish_arm() RETURNS void LANGUAGE plpgsql AS 'BEGIN RETURN; END';
    INSERT INTO properties VALUES('${PROP}','${ORG}','HB-new','active','published',NULL,NULL,'${ACTOR}',NULL,'${ACTOR}');
    INSERT INTO portal_connections VALUES('${ORG}','mvaimobiliare','fixture-encrypted');
    INSERT INTO portal_publications VALUES('${ORG}','${PROP}','mvaimobiliare',true,'HB-1465','${ACTOR}','${ACTOR}');
  `;
let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(setup);
  await db.exec(migration);
  await db.exec(snapshotMigration);
});
afterEach(async () => { await db.close(); });

describe('retrageri mva — PostgreSQL izolat, fără date reale', () => {
  it('deselectarea creează un singur job cu idstr păstrat, chiar dacă rândul încearcă să-l golească', async () => {
    await db.exec(`UPDATE portal_publications SET enabled=false,external_ref=NULL;`);
    expect((await db.query('SELECT enabled,external_ref FROM portal_publications')).rows).toEqual([{ enabled: false, external_ref: 'HB-1465' }]);
    await db.query('SELECT request_mva_withdrawal($1,$2,$3)', [ORG, PROP, ACTOR]);
    expect((await db.query('SELECT portal_key,enabled,mva_withdraw_idstr FROM portal_publish_jobs')).rows).toEqual([{ portal_key: 'mvaimobiliare', enabled: false, mva_withdraw_idstr: 'HB-1465' }]);
  });
  it.each(["status='sold'", "status='archived'", "deleted_at=now()", "publish_status='withdrawn'", "development_withdrawn_at=now()"])("neeligibilitate %s creează retragerea", async patch => {
    await db.exec(`UPDATE properties SET ${patch};`);
    expect((await db.query('SELECT enabled,mva_withdraw_idstr FROM portal_publish_jobs')).rows).toEqual([{ enabled: false, mva_withdraw_idstr: 'HB-1465' }]);
  });
  it('folosește identificatorul publicat, nu referința modificată între timp', async () => {
    await db.exec(`INSERT INTO portal_listings VALUES('${ORG}','${PROP}','mvaimobiliare','HB-original','published'); UPDATE portal_publications SET enabled=false;`);
    expect((await db.query('SELECT mva_withdraw_idstr FROM portal_publish_jobs')).rows).toEqual([{ mva_withdraw_idstr: 'HB-original' }]);
  });
  it('fără identificatori salvați folosește referința de feed', async () => {
    await db.exec(`UPDATE portal_publications SET external_ref=NULL; UPDATE portal_publications SET enabled=false;`);
    expect((await db.query('SELECT mva_withdraw_idstr FROM portal_publish_jobs')).rows).toEqual([{ mva_withdraw_idstr: 'HB-new' }]);
  });
  it('publicarea în așteptare devine retragere, fără al doilea job', async () => {
    await db.exec(`INSERT INTO portal_publish_jobs(organization_id,property_id,portal_key,enabled,requested_by,operation) VALUES('${ORG}','${PROP}','mvaimobiliare',true,'${ACTOR}','apply'); UPDATE portal_publications SET enabled=false;`);
    expect((await db.query('SELECT enabled,mva_withdraw_idstr FROM portal_publish_jobs')).rows).toEqual([{ enabled: false, mva_withdraw_idstr: 'HB-1465' }]);
  });
  it('un job de retragere deja în coadă primește idstr-ul înainte să se schimbe referința', async () => {
    await db.exec(`INSERT INTO portal_publish_jobs(organization_id,property_id,portal_key,enabled,requested_by,operation) VALUES('${ORG}','${PROP}','mvaimobiliare',false,'${ACTOR}','apply'); UPDATE portal_publications SET enabled=false; UPDATE properties SET reference='HB-later';`);
    expect((await db.query('SELECT mva_withdraw_idstr FROM portal_publish_jobs')).rows).toEqual([{ mva_withdraw_idstr: 'HB-1465' }]);
  });
  it.each(['done', 'error', 'queued'])('o publicare în lucru păstrează cererea de retragere după %s', async status => {
    await db.exec(`INSERT INTO portal_publish_jobs(organization_id,property_id,portal_key,enabled,requested_by,status,operation) VALUES('${ORG}','${PROP}','mvaimobiliare',true,'${ACTOR}','running','apply'); UPDATE portal_publications SET enabled=false;`);
    expect((await db.query('SELECT mva_withdraw_requested_at IS NOT NULL AS pending FROM portal_publish_jobs')).rows).toEqual([{ pending: true }]);
    await db.query('UPDATE portal_publish_jobs SET status=$1', [status]);
    expect((await db.query("SELECT enabled,mva_withdraw_idstr FROM portal_publish_jobs WHERE status='queued'")).rows).toEqual([{ enabled: false, mva_withdraw_idstr: 'HB-1465' }]);
  });
  it('fără cheie sau pentru alt portal nu creează retrageri API', async () => {
    await db.exec(`UPDATE portal_connections SET portal_credentials_encrypted=NULL; UPDATE portal_publications SET enabled=false; UPDATE properties SET status='sold';`);
    expect((await db.query('SELECT * FROM portal_publish_jobs')).rows).toEqual([]);
    await db.exec(`UPDATE portal_connections SET portal_credentials_encrypted='fixture'; UPDATE portal_publications SET portal_key='imospot',enabled=true; UPDATE portal_publications SET enabled=false,external_ref=NULL;`);
    expect((await db.query('SELECT * FROM portal_publish_jobs')).rows).toEqual([]);
    expect((await db.query('SELECT external_ref FROM portal_publications')).rows).toEqual([{ external_ref: null }]);
  });
  it('la aplicare nu retrimite anunțurile deja debifate, nici cele 48 fără idstr', async () => {
    await db.close(); db = new PGlite();
    await db.exec(setup);
    await db.exec(`INSERT INTO portal_publications SELECT '${ORG}',md5(n::text)::uuid,'mvaimobiliare',false,NULL,'${ACTOR}','${ACTOR}' FROM generate_series(1,48) n;`);
    await db.exec(migration);
    await db.exec(snapshotMigration);
    expect((await db.query('SELECT * FROM portal_publish_jobs')).rows).toEqual([]);
    expect((await db.query('SELECT count(*)::integer AS count FROM portal_publications WHERE enabled=false AND external_ref IS NULL')).rows).toEqual([{ count: 48 }]);
    await db.exec(`UPDATE portal_publications SET updated_by='${ACTOR}' WHERE enabled=false;`);
    expect((await db.query('SELECT * FROM portal_publish_jobs')).rows).toEqual([]);
  });
});