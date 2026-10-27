import { expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
it('completion atomically saves one persistent notification with a batch report link', async () => {
 const db=new PGlite();
 await db.exec(`CREATE TABLE portal_republish_batches(id uuid PRIMARY KEY, organization_id uuid, requested_by uuid,kind text,status text,succeeded int,failed int,skipped int);
 CREATE TABLE notifications(id uuid PRIMARY KEY,organization_id uuid,user_id uuid,created_by uuid,type text,title text,body text,link text);`);
 await db.exec(readFileSync('drizzle/migrations/0198_republish_completion_notification.sql','utf8'));
 const id='11111111-1111-4111-8111-111111111111';
 await db.query("INSERT INTO portal_republish_batches VALUES($1,$1,$1,'republish','running',38,2,3)",[id]);
 expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(0);
 await db.query("UPDATE portal_republish_batches SET status='done' WHERE id=$1",[id]);
 await db.query("UPDATE portal_republish_batches SET status='done' WHERE id=$1",[id]);
 const r=await db.query<any>('SELECT * FROM notifications');expect(r.rows).toHaveLength(1);expect(r.rows[0].title).toBe('Republicare terminată: 38 reușite, 2 erori');expect(r.rows[0].body).toBe('38 reușite, 2 erori, 3 sărite.');expect(r.rows[0].link).toBe(`/app/properties?republicare=${id}`);expect(r.rows[0].user_id).toBe(id);
 await db.close();
});