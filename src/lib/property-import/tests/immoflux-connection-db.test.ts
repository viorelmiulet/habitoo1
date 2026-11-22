import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { encryptImmofluxKey } from "../immoflux/connection.server";

let db: PGlite;
const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const SA = "00000000-0000-4000-8000-000000000099";
const AGENT = "00000000-0000-4000-8000-000000000010";
let credential: ReturnType<typeof encryptImmofluxKey>;
beforeAll(async () => {
  credential = encryptImmofluxKey(randomBytes(32).toString("hex"));
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
    create function public.is_superadmin() returns boolean language sql as $$select current_setting('test.super',true)='true'$$;
    create table organizations(id uuid primary key);
    create table user_roles(user_id uuid,role text);
    create table audit_logs(organization_id uuid,actor_id uuid,action text,entity text,entity_id uuid,new_values jsonb,created_by uuid);
    insert into organizations values('${ORG}'),('${OTHER}'); insert into user_roles values('${SA}','superadmin');`);
  await db.exec(readFileSync("drizzle/migrations/0318_immoflux_agency_connection_stage1.sql", "utf8"));
  await db.exec("set test.role='service_role';");
  await db.query("select save_immoflux_connection($1,$2,$3,$4,$5,$6,$7)", [ORG, "agency.immoflux.ro", "habitoo", credential.encrypted, credential.digest, true, SA]);
});
afterAll(async () => db?.close());
describe("applied IMMOFLUX connection migration", () => {
  it("only SuperAdmin sees metadata; no authenticated caller can read encrypted credentials", async () => {
    await db.exec("set role authenticated; set test.super='false'");
    expect((await db.query("select host from immoflux_connections")).rows).toHaveLength(0);
    await db.exec("set test.super='true'");
    expect((await db.query("select host from immoflux_connections")).rows).toEqual([{ host: "agency.immoflux.ro" }]);
    await expect(db.query("select api_key_encrypted from immoflux_connections")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
  it("agency admins and agents cannot write or invoke the save RPC", async () => {
    await db.exec("set role authenticated");
    await expect(db.exec("update immoflux_connections set enabled=false")).rejects.toThrow(/permission denied/);
    await expect(db.query("select save_immoflux_connection($1,$2,$3,$4,$5,$6,$7)", [ORG,"agency.immoflux.ro","habitoo",null,null,false,AGENT])).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    await expect(db.query("select save_immoflux_connection($1,$2,$3,$4,$5,$6,$7)", [ORG,"agency.immoflux.ro","habitoo",null,null,false,AGENT])).rejects.toThrow(/Acces refuzat/);
  });
  it("duplicate configuration cannot be saved to a different agency", async () => {
    await expect(db.query("select save_immoflux_connection($1,$2,$3,$4,$5,$6,$7)", [OTHER,"agency.immoflux.ro","habitoo",credential.encrypted,credential.digest,true,SA])).rejects.toThrow(/deja folosită de altă agenție/);
    expect((await db.query("select organization_id from immoflux_connections")).rows).toEqual([{ organization_id: ORG }]);
  });
  it("saving and activation changes are atomic and audit excludes credential columns", async () => {
    await db.query("select save_immoflux_connection($1,$2,$3,$4,$5,$6,$7)", [ORG,"agency.immoflux.ro","habitoo",null,null,false,SA]);
    const rows = (await db.query<{ action: string; new_values: Record<string, unknown> }>("select action,new_values from audit_logs")).rows;
    expect(rows.map(r => r.action)).toEqual(["immoflux.saved", "immoflux.enabled", "immoflux.saved", "immoflux.disabled"]);
    for (const row of rows) expect(Object.keys(row.new_values).sort()).toEqual(row.action === "immoflux.saved" ? ["enabled", "host", "slug"] : ["enabled"]);
    expect((await db.query<{ enabled: boolean; preserved: boolean }>("select enabled,api_key_encrypted=$1 as preserved from immoflux_connections where organization_id=$2",[credential.encrypted,ORG])).rows[0]).toEqual({enabled:false,preserved:true});
  });
});