import { beforeAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const ORG = "00000000-0000-4000-8000-000000000001";
const USR = "00000000-0000-4000-8000-000000000010";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role authenticated; create role service_role;
    create table organizations(id uuid primary key, name text, public_slug text);
    create table profiles(id uuid primary key, organization_id uuid, full_name text, public_slug text);
    grant select, update on organizations, profiles to authenticated, service_role;
    insert into organizations values('${ORG}','Agentia','agentia-buc');
    insert into profiles values('${USR}','${ORG}','Ion','ion');`);
  await db.exec(readFileSync("drizzle/migrations/0314_public_slug_immutable_guard.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
});
for (const role of ["authenticated", "service_role"]) {
  it(`${role} cannot change agency slug`, async () => {
    await db.exec(`set role ${role}`);
    await expect(db.exec(`update organizations set public_slug='alt' where id='${ORG}'`)).rejects.toThrow(/nu poate fi modificată/);
    await db.exec("reset role");
  });
  it(`${role} cannot change agent slug`, async () => {
    await db.exec(`set role ${role}`);
    await expect(db.exec(`update profiles set public_slug='alt' where id='${USR}'`)).rejects.toThrow(/nu poate fi modificată/);
    await db.exec("reset role");
  });
}
it("other fields and unchanged slug still update", async () => {
  await db.exec("set role authenticated");
  await db.exec(`update organizations set name='Nou', public_slug='agentia-buc' where id='${ORG}'`);
  await db.exec("reset role");
  const r = await db.query<{ public_slug: string; name: string }>(`select * from organizations`);
  expect(r.rows[0]).toMatchObject({ name: "Nou", public_slug: "agentia-buc" });
});
