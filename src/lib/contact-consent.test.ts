import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { contactConsentPatch } from './contact-consent';

const actor = '11111111-1111-4111-8111-111111111111';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${actor}'::uuid $$;
    CREATE TABLE contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, source text, gdpr_consent boolean DEFAULT false);
    CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid,contact_id uuid,source text);`);
  await db.exec(readFileSync('drizzle/migrations/0196_contacts_source_consent_history.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0197_contact_source_portal_aliases.sql', 'utf8'));
});
afterAll(async () => { await db.close(); });
async function add(consent = true, method = 'email', source = 'OLX') {
  const r = await db.query<{id:string}>(`INSERT INTO contacts(source,gdpr_consent,gdpr_consent_method) VALUES ($1,$2,$3) RETURNING id`, [source, consent, method]);
  return r.rows[0].id;
}
async function row(id:string) { const r = await db.query<any>('SELECT * FROM contacts WHERE id=$1',[id]); return r.rows[0]; }
it('requires a selected method for granted consent', () => {
  expect(() => contactConsentPatch({source:'OLX',gdpr_consent:true,gdpr_consent_method:''})).toThrow();
  expect(contactConsentPatch({source:'Recomandare',gdpr_consent:true,gdpr_consent_method:'verbal'})).toEqual({source:'Recomandare',gdpr_consent:true,gdpr_consent_method:'verbal'});
});
it('records server date and authenticated agent for all four modes', async () => {
  for (const mode of ['verbal','scris','email','formular pe site']) {
    const c = await row(await add(true,mode));
    expect(c.gdpr_consent_by).toBe(actor); expect(c.gdpr_consent_at).toBeTruthy(); expect(c.gdpr_consent_method).toBe(mode); expect(c.gdpr_consent_history).toHaveLength(1);
  }
});
it('rejects granted consent without evidence mode on the database', async () => { await expect(add(true,'')).rejects.toThrow('Alege modul'); });
it('withdrawal retains the grant date/mode and appends history across reconsent', async () => {
  const id = await add(); const original = await row(id);
  await db.query('UPDATE contacts SET gdpr_consent=false WHERE id=$1',[id]);
  const c = await row(id); expect(c.gdpr_consent).toBe(false); expect(c.gdpr_withdrawn_at).toBeTruthy(); expect(c.gdpr_consent_at).toEqual(original.gdpr_consent_at); expect(c.gdpr_consent_method).toBe('email'); expect(c.gdpr_consent_history.map((e:any)=>e.action)).toEqual(['granted','withdrawn']);
  await db.query("UPDATE contacts SET gdpr_consent=true,gdpr_consent_method='scris' WHERE id=$1",[id]);
  expect((await row(id)).gdpr_consent_history.map((e:any)=>e.action)).toEqual(['granted','withdrawn','granted']);
});
it('client cannot forge or erase dates, agent or history by editing', async () => {
  const id=await add(); const c=await row(id);
  await db.query("UPDATE contacts SET gdpr_consent_history='[]',gdpr_consent_at=null,gdpr_consent_by=null,gdpr_consent_method='verbal' WHERE id=$1",[id]);
  const next=await row(id); expect(next.gdpr_consent_history).toEqual(c.gdpr_consent_history); expect(next.gdpr_consent_at).toEqual(c.gdpr_consent_at); expect(next.gdpr_consent_by).toBe(actor); expect(next.gdpr_consent_method).toBe('email');
});
it('automatic site, portal and MAP sources are canonicalized without implied consent', async () => {
  for (const [source,label] of [['website','Site-ul agenției'],['website:contact','Site-ul agenției'],['Storia.ro','Storia'],['vdi','Imobiliare.ro'],['imobiliare','Imobiliare.ro'],['map','Anunțuri particulari (MAP)']]) {
    const c=await row(await add(false,'',source)); expect(c.source).toBe(label); expect(c.gdpr_consent).toBe(false); expect(c.gdpr_consent_history).toEqual([]);
  }
});
it('linking a portal lead fills missing source only in its agency', async () => {
  const org='22222222-2222-4222-8222-222222222222';
  const id=await add(false,'',''); await db.query('UPDATE contacts SET organization_id=$1 WHERE id=$2',[org,id]);
  await db.query("INSERT INTO leads(organization_id,contact_id,source) VALUES ($1,$2,'storia')",[org,id]);
  expect((await row(id)).source).toBe('Storia');
  await db.query("UPDATE leads SET source='olx' WHERE contact_id=$1",[id]); expect((await row(id)).source).toBe('Storia');
});