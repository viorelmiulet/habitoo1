import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { mvaLeadTestDb } from './lead-test-db';
import { mvaimobiliareAdapter } from '../adapters/mvaimobiliare.server';
import { generateMvaLeadToken, hashMvaLeadToken, clearMvaLeadTokenCache, prepareMvaLeadDelivery, MVA_LEADS_BASE_URL } from './lead-tokens.server';
import { handleMvaLeadRequest, authenticateMvaLeadRequest } from './lead-handlers.server';
import { getPortalDefinition } from '../registry';
import { properstarEntityId } from '../properstar/mapper';
import type { FeedAuthOk } from '@/lib/site-feed/auth.server';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROP = '33333333-3333-4333-8333-333333333333';
const FOREIGN = '44444444-4444-4444-8444-444444444444';
const AGENT = '55555555-5555-4555-8555-555555555555';
const KEY = 'fictitious-original-key';
const NEXT_KEY = 'fictitious-next-key';
let pg: PGlite;
let db: ReturnType<typeof mvaLeadTestDb>;
const fetchMock = vi.fn<typeof fetch>();
const definition = getPortalDefinition('mvaimobiliare');
if (!definition) throw new Error('Missing definition');
const context = (key = KEY) => ({ organizationId: ORG, definition, direction: 'habitoo_to_portal' as const, authenticationMode: 'portal_api_key' as const, portalCredential: key, externalAccountId: null, settings: {}, allowLiveRequests: true });
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (t: string) => db.from(t), rpc: (name: string, args: Record<string, unknown>) => db.rpc(name, args) } }));
vi.mock('../crypto.server', () => ({ decryptPortalCredential: (cipher: string) => cipher === 'fixture-original' ? KEY : cipher === 'fixture-next' ? NEXT_KEY : null, encryptPortalCredential: (raw: string) => raw === KEY ? 'fixture-original' : 'fixture-next' }));
vi.mock('@/lib/site-feed/auth.server', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/site-feed/auth.server')>();
  return { ...actual, feedRequestRateLimited: () => false, withFeedAuth: async (_request: Request, _endpoint: string, handler: (auth: FeedAuthOk) => Promise<{response: Response}>) => (await handler({ ok: true, organizationId: ORG, tokenId: 'fixture-feed', tokenPrefix: 'fixture', source: 'portal_key', portal: 'mvaimobiliare', scopes: ['leads:write'] })).response };
});
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, createFileRoute: () => (config: unknown) => config };
});
vi.mock('@tanstack/react-start', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-start')>();
  const build = () => { const self: Record<string, unknown> = {}; self['middleware'] = () => self; self['inputValidator'] = () => self; self['handler'] = (fn: unknown) => fn; return self; };
  return { ...actual, createServerFn: build };
});
vi.mock('@/lib/org-access', () => ({ requireActiveOrgAuth: {} }));
vi.mock('../rate-limit.server', () => ({ portalRateLimited: () => false }));
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE organizations(id uuid PRIMARY KEY,name text);
    CREATE TABLE portal_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,portal text,activated boolean,portal_credentials_encrypted text,settings jsonb,direction text,authentication_mode text,updated_by uuid,status text,last_sync_error text);
    CREATE TABLE properties(id uuid PRIMARY KEY,organization_id uuid,reference text,assigned_to uuid,title text,deleted_at timestamptz);
    CREATE TABLE contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,type text,first_name text,last_name text,phone text,email text,source text,notes text,status text);
    CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,property_id uuid,contact_id uuid,name text,phone text,email text,source text,stage text,notes text,assigned_to uuid,last_interaction_at timestamptz);
    CREATE TABLE lead_events(id uuid DEFAULT gen_random_uuid(),organization_id uuid,lead_id uuid,to_stage text,note text);
    CREATE TABLE portal_messages(id uuid DEFAULT gen_random_uuid(),organization_id uuid,portal text,property_id uuid,lead_id uuid,sender_name text,sender_email text,sender_phone text,body text,sent_at timestamptz,expires_at timestamptz);
    CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,type text,title text,body text,link text);
    CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(),organization_id uuid,action text,entity text,entity_id uuid,new_values jsonb);
    CREATE TABLE portal_lead_links(organization_id uuid,portal text,external_lead_id text,lead_id uuid,updated_at timestamptz,environment text,UNIQUE(portal,organization_id,external_lead_id,environment));
    CREATE TABLE site_feed_access_logs(organization_id uuid,token_prefix text,endpoint text,method text,status int,items int,detail text);
    CREATE TABLE portal_operation_logs(organization_id uuid,portal text,operation text,success boolean,error_code text,error_message text,property_id uuid,actor_id uuid,http_status int,portal_response jsonb,external_id text,duration_ms int);
    CREATE TABLE site_feed_visits(organization_id uuid,property_id uuid,views int,source text,occurred_on date,updated_at timestamptz);
    CREATE UNIQUE INDEX site_feed_visits_unique ON site_feed_visits(organization_id,property_id,occurred_on,coalesce(source,''));`);
  await pg.exec(readFileSync('drizzle/migrations/0349_mva_lead_tokens.sql','utf8'));
  await pg.exec(readFileSync('supabase/migrations/20260906054505_02aecb96-c710-4b75-b18d-51e2fc8088cc.sql','utf8'));
  await pg.exec(readFileSync('drizzle/migrations/0245_site_feed_visit_event_receipts.sql','utf8'));
}, 15000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  clearMvaLeadTokenCache(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async url => String(url).endsWith('/account') ? reply({ agency_id: properstarEntityId('hb', ORG) }) : reply({ status: 'updated' }));
  await pg.exec(`TRUNCATE mva_lead_tokens,portal_connections,organizations,properties,contacts,leads,lead_events,portal_messages,notifications,audit_logs,portal_lead_links,site_feed_access_logs,portal_operation_logs,site_feed_visits,site_feed_visit_events CASCADE;
    INSERT INTO organizations VALUES('${ORG}','Test Agency'),('${OTHER}','Other Agency');
    INSERT INTO portal_connections(organization_id,portal,activated,portal_credentials_encrypted,settings) VALUES('${ORG}','mvaimobiliare',true,'fixture-original','{"allow_live":true}');
    INSERT INTO properties VALUES('${PROP}','${ORG}','HB-1','${AGENT}','Apartament test',null),('${FOREIGN}','${OTHER}','HB-OTHER',null,'Altă agenție',null);`);
  db = mvaLeadTestDb(pg);
});
afterEach(() => vi.unstubAllGlobals());
const count = async (table: string) => (await pg.query<{n: number}>(`select count(*)::int as n from ${table}`)).rows[0]?.n ?? 0;
function deliveredToken(): string {
  const call = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/agency'));
  const body = JSON.parse(String(call?.[1]?.body)) as { habitoo_leads?: {token: string} };
  const token = body.habitoo_leads?.token;
  if (!token) throw new Error('No token delivered');
  return token;
}
async function connect() { expect((await mvaimobiliareAdapter.testConnection(context())).ok).toBe(true); return deliveredToken(); }
const request = (endpoint: string, token: string, body: unknown) => new Request(`${MVA_LEADS_BASE_URL}/${endpoint}`, { method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type':'application/json'}, body: JSON.stringify(body) });
type TestRoute = { server: { handlers: { POST: (args: {request: Request}) => Promise<Response> } } };

describe('tokenuri lead-uri mvaimobiliare — bază izolată și API simulată', () => {
  it('tokenul are prefixul cerut și 32 de octeți aleatori', () => {
    const one = generateMvaLeadToken(); const two = generateMvaLeadToken();
    expect(one.token.startsWith('hbml_')).toBe(true);
    expect(Buffer.from(one.token.slice(5),'base64url').length).toBe(32);
    expect(one.token === two.token).toBe(false);
  });
  it('primul test emite o singură dată, salvează numai hash-ul/data și trimite tokenul doar când e nou', async () => {
    const token = await connect();
    const before = (await pg.query<Record<string,unknown>>('select * from mva_lead_tokens')).rows[0];
    expect(before?.['token_hash'] === hashMvaLeadToken(token)).toBe(true);
    expect(before?.['issued_at']).toBeTruthy(); expect(before?.['delivered_at']).toBeTruthy();
    expect(JSON.stringify(before).includes(token)).toBe(false);
    const delivered = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(delivered.habitoo_leads.base_url).toBe('https://crm.habitoo.ro/api/public/portal/v1/mvaimobiliare');
    fetchMock.mockClear();
    expect((await mvaimobiliareAdapter.testConnection(context())).ok).toBe(true);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).not.toHaveProperty('habitoo_leads');
    expect((await pg.query<Record<string,unknown>>('select * from mva_lead_tokens')).rows[0]).toEqual(before);
    expect(await count('mva_lead_tokens')).toBe(1);
  });
  it('PUT eșuat retrimite tokenul nelivrat la următorul test și nu îl jurnalizează', async () => {
    fetchMock.mockImplementation(async url => String(url).endsWith('/account') ? reply({ agency_id: properstarEntityId('hb', ORG) }) : reply({},503));
    expect((await mvaimobiliareAdapter.testConnection(context())).ok).toBe(false);
    const first = deliveredToken();
    expect((await pg.query<{delivered_at:string|null}>('select delivered_at from mva_lead_tokens')).rows[0]?.['delivered_at']).toBeNull();
    fetchMock.mockClear(); fetchMock.mockImplementation(async url => String(url).endsWith('/account') ? reply({ agency_id: properstarEntityId('hb', ORG) }) : reply({status:'updated'}));
    expect((await mvaimobiliareAdapter.testConnection(context())).ok).toBe(true);
    expect(deliveredToken() === first).toBe(true);
    expect(JSON.stringify((await pg.query<Record<string,unknown>>('select * from mva_lead_tokens')).rows).includes(first)).toBe(false);
  });
  it('după un Worker întrerupt înlocuiește tokenul nelivrat, fără secret recuperabil în baza de date', async () => {
    fetchMock.mockImplementation(async url => String(url).endsWith('/account') ? reply({ agency_id: properstarEntityId('hb', ORG) }) : reply({},503));
    await mvaimobiliareAdapter.testConnection(context()); const first = deliveredToken();
    clearMvaLeadTokenCache(); fetchMock.mockClear();
    fetchMock.mockImplementation(async url => String(url).endsWith('/account') ? reply({ agency_id: properstarEntityId('hb', ORG) }) : reply({status:'updated'}));
    await mvaimobiliareAdapter.testConnection(context());
    expect(deliveredToken() === first).toBe(false);
    expect(await authenticateMvaLeadRequest(request('contacts',first,{}),db)).toBeNull();
  });
  it('422 care repetă tokenul nu îl expune în mesaj sau detalii', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/account')) return reply({agency_id:properstarEntityId('hb',ORG)});
      const token = JSON.parse(String(init?.body)).habitoo_leads.token;
      return reply({ fields: { habitoo_leads: `Invalid ${token}` } },422);
    });
    const result = await mvaimobiliareAdapter.testConnection(context());
    expect(result.ok).toBe(false); expect(JSON.stringify(result).includes(deliveredToken())).toBe(false);
  });
  it.each([200,401])('test eșuat sau cont altei agenții (%i) nu emite token', async status => {
    fetchMock.mockResolvedValue(reply({agency_id:'hb-other'},status));
    await mvaimobiliareAdapter.testConnection(context());
    expect(await count('mva_lead_tokens')).toBe(0); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('o livrare simultană este refuzată; lease expirat se recuperează', async () => {
    const first = await prepareMvaLeadDelivery(context(),db);
    expect(first).not.toBeNull();
    await expect(prepareMvaLeadDelivery(context(),db)).rejects.toBeInstanceOf(Error);
    await pg.exec("update mva_lead_tokens set locked_until=now()-interval '1 second'");
    expect(await prepareMvaLeadDelivery(context(),db)).not.toBeNull();
  });
  it('POST contacts creează același lead/mesaj/notificare ca ruta feedului și nu dublează message_id', async () => {
    const token = await connect();
    const body = { nume:'Ana Test',telefon:'0722000000',idstr:'HB-1',mesaj:'Solicit o vizionare',message_id:'mva-contact-1' };
    const route = (await import('@/routes/api/public/portal/v1/mvaimobiliare/contacts')).Route as unknown as TestRoute;
    const first = await route.server.handlers.POST({request:request('contacts',token,body)});
    expect(first.status).toBe(201);
    const firstJson = await first.json();
    const repeat = await route.server.handlers.POST({request:request('contacts',token,body)});
    expect(repeat.status).toBe(200); expect((await repeat.json()).data.deduplicated).toBe(true);
    expect(await count('leads')).toBe(1); expect(await count('contacts')).toBe(1); expect(await count('portal_messages')).toBe(1); expect(await count('notifications')).toBe(1);
    const originalLead = (await pg.query('select property_id,name,phone,source,stage,assigned_to from leads')).rows[0];
    const originalNotice = (await pg.query('select user_id,type,title,body,link from notifications')).rows[0];
    expect(originalLead).toMatchObject({ property_id:PROP,source:'mvaimobiliare.ro',assigned_to:AGENT });
    const feedRoute = (await import('@/routes/api/public/sites/v1/contacts')).Route as unknown as TestRoute;
    const crossRetry = await feedRoute.server.handlers.POST({ request: new Request('https://crm.habitoo.ro/api/public/sites/v1/contacts',{method:'POST',body:JSON.stringify(body)}) });
    expect((await crossRetry.json()).data.lead_id).toBe(firstJson.data.lead_id);
    await pg.exec('TRUNCATE contacts,leads,lead_events,portal_messages,notifications,audit_logs,portal_lead_links');
    const feed = await feedRoute.server.handlers.POST({request:new Request('https://crm.habitoo.ro/api/public/sites/v1/contacts',{method:'POST',body:JSON.stringify(body)})});
    expect(feed.status).toBe(201);
    expect((await pg.query('select property_id,name,phone,source,stage,assigned_to from leads')).rows[0]).toEqual(originalLead);
    expect((await pg.query('select user_id,type,title,body,link from notifications')).rows[0]).toEqual(originalNotice);
  });
  it('token greșit, token feed, Basic sau query token → 401 fără efecte', async () => {
    await connect(); const wrong = generateMvaLeadToken().token;
    const body = {nume:'Ana Test',telefon:'0722000000',idstr:'HB-1'};
    for (const token of [wrong,'hbt_feed-fixture']) expect((await handleMvaLeadRequest(request('contacts',token,body),'contacts',db)).status).toBe(401);
    expect((await handleMvaLeadRequest(new Request(`${MVA_LEADS_BASE_URL}/contacts?token=${wrong}`,{method:'POST',body:JSON.stringify(body)}),'contacts',db)).status).toBe(401);
    expect((await handleMvaLeadRequest(new Request(`${MVA_LEADS_BASE_URL}/contacts`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`user:${wrong}`).toString('base64')}`},body:JSON.stringify(body)}),'contacts',db)).status).toBe(401);
    expect(await count('leads')).toBe(0);
  });
  it('anunț al altei agenții → 404, prin id și idstr, fără lead', async () => {
    const token = await connect();
    for (const identity of [{id:FOREIGN},{idstr:'HB-OTHER'}]) expect((await handleMvaLeadRequest(request('contacts',token,{nume:'Ana Test',telefon:'0722000000',...identity}),'contacts',db)).status).toBe(404);
    expect(await count('leads')).toBe(0);
  });
  it('schimbarea cheii API invalidează atomic tokenul vechi și emite unul nou la următorul test', async () => {
    const first = await connect();
    const {savePortalConnectionCore} = await import('@/lib/portals.functions');
    await savePortalConnectionCore({organizationId:ORG,actorId:AGENT,data:{portalId:'mvaimobiliare',credential:NEXT_KEY}});
    expect(await authenticateMvaLeadRequest(request('contacts',first,{}),db)).toBeNull();
    fetchMock.mockClear(); expect((await mvaimobiliareAdapter.testConnection(context(NEXT_KEY))).ok).toBe(true);
    const second = deliveredToken(); expect(second === first).toBe(false);
    expect(await authenticateMvaLeadRequest(request('contacts',second,{}),db)).toMatchObject({organizationId:ORG});
  });
  it('reintroducerea aceleiași chei nu regenerează tokenul', async () => {
    const token = await connect();
    const before = (await pg.query<Record<string,unknown>>('select * from mva_lead_tokens')).rows[0];
    const {savePortalConnectionCore} = await import('@/lib/portals.functions');
    await savePortalConnectionCore({organizationId:ORG,actorId:AGENT,data:{portalId:'mvaimobiliare',credential:KEY}});
    expect((await pg.query<Record<string,unknown>>('select * from mva_lead_tokens')).rows[0]).toEqual(before);
    expect(await authenticateMvaLeadRequest(request('contacts',token,{}),db)).not.toBeNull();
  });
  it('visits și views reutilizează contorul și deduplicarea feedului, inclusiv între rute', async () => {
    const token = await connect(); const body = {id:PROP,views:7,event_id:'mva-views-1'};
    const visits = (await import('@/routes/api/public/portal/v1/mvaimobiliare/visits')).Route as unknown as TestRoute;
    const views = (await import('@/routes/api/public/portal/v1/mvaimobiliare/views')).Route as unknown as TestRoute;
    expect((await visits.server.handlers.POST({request:request('visits',token,body)})).status).toBe(200);
    const repeated = await views.server.handlers.POST({request:request('views',token,body)});
    expect((await repeated.json()).deduplicated).toBe(true);
    const feed = (await import('@/routes/api/public/sites/v1/visits')).Route as unknown as TestRoute;
    expect((await (await feed.server.handlers.POST({request:new Request('https://crm.habitoo.ro/api/public/sites/v1/visits',{method:'POST',body:JSON.stringify(body)})})).json()).deduplicated).toBe(true);
    expect((await pg.query<{n:number}>('select sum(views)::int as n from site_feed_visits')).rows[0]?.n).toBe(7);
    expect((await handleMvaLeadRequest(request('views',token,{id:FOREIGN,event_id:'foreign'}),'views',db)).status).toBe(404);
  });
  it('contactele păstrează validările JSON și ale corpului cererii', async () => {
    const token = await connect();
    expect((await handleMvaLeadRequest(request('contacts',token,{nume:'A'}),'contacts',db)).status).toBe(422);
    expect((await handleMvaLeadRequest(new Request(`${MVA_LEADS_BASE_URL}/contacts`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:'{'}),'contacts',db)).status).toBe(400);
  });
  it('tabelul este numai pentru service-role și nu conține tokenul brut', async () => {
    const columns = await pg.query<{column_name:string}>('select column_name from information_schema.columns where table_name=\'mva_lead_tokens\'');
    expect(columns.rows.map(c=>c.column_name)).toEqual(['organization_id','token_hash','credential_hash','issued_at','delivered_at','claim_token','locked_until']);
    await expect(pg.exec('set role authenticated;select * from mva_lead_tokens')).rejects.toThrow(); await pg.exec('reset role');
  });
});
