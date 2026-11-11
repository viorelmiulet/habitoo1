import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { renderCampaign, runTestSend, validateCampaign, type CampaignInput } from "./outreach-message";
import { buildWorkspaceGmailMime } from "./gmail/gmail-workspace.server";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const base: CampaignInput = { name: "C", subject: "Salut {{agency_name}}", body_text: "Bună ziua, {{agency_name}} din {{city}}.\n\nVezi https://www.habitoo.ro.", sender_name: "Habitoo", footer_text: "Habitoo SRL, București", status: "draft" };
const r = { agency_name: "Agenția A & B", city: "Cluj", unsubscribe_token: "T".repeat(64) };

describe("Outreach message rendering", () => {
  it("renders merge fields in subject, body and HTML", () => {
    const m = renderCampaign(base, r);
    expect(m.subject).toBe("Salut Agenția A & B");
    expect(m.text.startsWith("Bună ziua, Agenția A & B din Cluj.")).toBe(true);
    expect(m.html).toContain("Agenția A &amp; B");
    expect(m.html).toContain('<a href="https://www.habitoo.ro">https://www.habitoo.ro</a>.');
    expect(m.html).not.toMatch(/<img/i);
    expect(m.from).toBe("Habitoo <contact@habitoo.ro>");
  });
  it("rejects unknown merge fields and an empty footer", () => {
    expect(validateCampaign({ ...base, body_text: "Hi {{first_name}}" })).toEqual({ ok: false, error: expect.stringContaining("{{first_name}}") });
    expect(validateCampaign({ ...base, footer_text: "  " }).ok).toBe(false);
    expect(validateCampaign(base).ok).toBe(true);
  });
  it("always ends with the footer and the unsubscribe line", () => {
    const m = renderCampaign({ ...base, body_text: "Fără link" }, r);
    expect(m.text.endsWith(`Habitoo SRL, București\nDezabonare: https://www.habitoo.ro/dezabonare/${"T".repeat(64)}`)).toBe(true);
    expect(m.html).toContain(`https://www.habitoo.ro/dezabonare/${"T".repeat(64)}`);
  });
  it("sets both List-Unsubscribe headers in the multipart message", () => {
    const m = renderCampaign(base, r);
    expect(m.headers).toEqual({ "List-Unsubscribe": `<https://www.habitoo.ro/api/public/outreach/unsubscribe?token=${"T".repeat(64)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    const mime = buildWorkspaceGmailMime({ ...m, to: "test@example.com" });
    expect(mime).toContain(`List-Unsubscribe: <https://www.habitoo.ro/api/public/outreach/unsubscribe?token=${"T".repeat(64)}>`);
    expect(mime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(mime).toContain("multipart/alternative");
  });
});

describe("Outreach test send", () => {
  let pg: PGlite; let campaignId = ""; let listId = "";
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE TYPE app_role AS ENUM ('superadmin'); CREATE TABLE user_roles(user_id uuid,role app_role); INSERT INTO user_roles VALUES ('${ADMIN}','superadmin');
      CREATE FUNCTION has_role(_user_id uuid,_role app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
      CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(), actor_id uuid,action text,entity text,entity_id uuid,old_values jsonb,new_values jsonb, created_at timestamptz DEFAULT now());
      SET test.uid='${ADMIN}';`);
    for (const f of ["0265_outreach_recipient_lists", "0266_outreach_unsubscribe", "0267_outreach_campaigns"]) await pg.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
    listId = (await pg.query<{ r: { list_id: string } }>("select outreach_import('L',$1) r", [JSON.stringify([{ email: "a@x.ro", agency_name: "A", city: "Iași" }, { email: "b@x.ro" }])])).rows[0].r.list_id;
    campaignId = (await pg.query<{ id: string }>("insert into outreach_campaigns(list_id,name,subject,body_text,footer_text) values($1,'C','S {{city}}','B {{agency_name}}','F') returning id", [listId])).rows[0].id;
  });
  afterAll(async () => { await pg.close(); });
  const snapshot = async () => ({ r: (await pg.query("select email,status::text,sent_at,error from outreach_recipients order by email")).rows, s: (await pg.query("select * from outreach_suppressions")).rows });
  const deps = (send = vi.fn(async () => ({ ok: true }))) => ({ send, deps: {
    loadCampaign: async (id: string) => (await pg.query<CampaignInput & { list_id: string }>("select list_id,name,subject,body_text,sender_name,footer_text,status::text status from outreach_campaigns where id=$1", [id])).rows[0] ?? null,
    firstRecipient: async (l: string) => (await pg.query<typeof r>("select agency_name,city,unsubscribe_token from outreach_recipients where list_id=$1 order by created_at,id limit 1", [l])).rows[0] ?? null,
    take: async (id: string, to: string) => (await pg.query<{ ok: boolean }>("select outreach_test_send_take($1,$2) ok", [id, to])).rows[0].ok,
    send,
  } });
  it("sends only to the test address with first-recipient data and leaves statuses and suppressions unchanged", async () => {
    const before = await snapshot();
    const { send, deps: d } = deps();
    expect(await runTestSend(d, campaignId, " Tester@Example.com ")).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    const msg = (send.mock.calls[0] as unknown[])[0] as { to: string; subject: string; text: string };
    expect(msg.to).toBe("tester@example.com");
    const first = (await d.firstRecipient(listId))!;
    expect(msg.subject).toBe(`S ${first.city ?? ""}`);
    expect(msg.text).toContain(`B ${first.agency_name ?? ""}`);
    expect(msg.text).toContain(first.unsubscribe_token);
    expect(await snapshot()).toEqual(before);
    expect((await pg.query("select new_values from audit_logs where action='outreach.test_send'")).rows).toEqual([{ new_values: { to: "tester@example.com" } }]);
  });
  it("limits test sends to 10 per hour", async () => {
    const { send, deps: d } = deps();
    for (let i = 0; i < 9; i++) expect(await runTestSend(d, campaignId, "t@example.com")).toEqual({ ok: true });
    expect(await runTestSend(d, campaignId, "t@example.com")).toEqual({ ok: false, error: expect.stringContaining("10") });
    expect(send).toHaveBeenCalledTimes(9);
  });
});
