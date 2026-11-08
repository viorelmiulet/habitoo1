import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { spec as generated } from '../scripts/generate-partner-openapi';
import { partnerSpec, partnerOperations, partnerCurl, partnerRows } from '../src/lib/partner-developer-docs';
import { mapPartnerListing, mapPartnerAgent, mapPartnerAgency, TAXONOMIES, withdrawnTombstone } from '../src/lib/partner-api/schema';
import { sandboxListings, sandboxAgents } from '../src/lib/partner-api/sandbox';
import { publicationSchema, leadSchema, messageSchema, statsSchema, handlePartnerWrite } from '../src/lib/partner-api/write.server';
import { apiError, meResponse } from '../src/lib/partner-api/core.server';
import { handleChanges, handleAgencies, handleAgents, handleListings } from '../src/lib/partner-api/read.server';
import {webhookInput,webhookEvent} from '../src/lib/partner-api/webhook';
import {publicWebhook} from '../src/lib/partner-api/webhook.server';
const read=(p:string)=>readFileSync(p,'utf8');
const raw=read('public/dezvoltatori/partner-api.json');
const spec=JSON.parse(raw);
const listing=sandboxListings({apartment:'https://example.invalid/a.jpg',house:'https://example.invalid/h.jpg',land:'https://example.invalid/l.jpg'},'2026-11-07T12:00:00Z')[0];
const ctx:any={portal:{slug:'demo',display_name:'Portal Demo',rate_limit_per_minute:120},identity:{environment:'test'},requestId:'11111111-1111-4111-8111-111111111111'};
function assertSchema(value:any,input:any,path='root') {
  const s=input.$ref?spec.components.schemas[input.$ref.split('/').at(-1)]:input;
  if(s.anyOf){const errors=[];for(const option of s.anyOf){try{assertSchema(value,option,path);return;}catch(e){errors.push(e);}}throw errors[0];}
  if(s.type){const actual=value===null?'null':Array.isArray(value)?'array':typeof value;const types=[].concat(s.type);expect(types,path).toContain(actual==='number'&&types.includes('integer')?'integer':actual);if(actual==='number'&&types.includes('integer'))expect(Number.isInteger(value)).toBe(true);}
  if(s.const!==undefined)expect(value,path).toBe(s.const);
  if(s.enum)expect(s.enum,path).toContain(value);
  if(s.properties && value && typeof value==='object'&&!Array.isArray(value)){for(const k of s.required??[])expect(value,path).toHaveProperty(k);if(s.additionalProperties===false)expect(Object.keys(value).every(k=>k in s.properties),path).toBe(true);for(const [k,v]of Object.entries(value)){expect(s.properties[k],`${path}.${k} documented`).toBeDefined();assertSchema(v,s.properties[k],`${path}.${k}`);}}
  if(s.items && Array.isArray(value))value.forEach((v,i)=>assertSchema(v,s.items,`${path}[${i}]`));
}
describe('P6 — Partner API documentation',()=>{
  it('inventories every implemented route including webhook methods',()=>{
    const routes=readdirSync('src/routes/api/public/partner/v1').filter(f=>f.endsWith('.ts')&&f!=='$.ts');
    const found:string[]=[];
    for(const file of routes){const text=read(`src/routes/api/public/partner/v1/${file}`);const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);let route='';function visit(n:ts.Node){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='createFileRoute'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))route=n.arguments[0].text;ts.forEachChild(n,visit);}visit(ast);const path=route.replace('/api/public/partner/v1','').replace(/\$id/g,'{id}');expect(spec.paths,path).toHaveProperty(path);const methods=file==='webhook.ts'?['get','put','delete']:file==='webhook.deliveries.ts'?['get']:file==='me.ts'||text.includes('partnerGet(')?['get']:['post'];for(const method of methods)expect(spec.paths[path][method]).toBeDefined();found.push(path);}
    expect(Object.keys(spec.paths).sort()).toEqual(found.sort());
    expect(Object.keys(spec.paths).filter(p=>p.includes('webhook'))).toHaveLength(3);
  });
  it('is generated reproducibly from real serializers and input validators',()=>{expect(spec).toEqual(generated);expect(spec.openapi).toBe('3.1.0');});
  it('matches listing serialization for precise, imprecise and withdrawn properties',()=>{
    const row:any={id:listing.id,organization_id:listing.agency_id,property_type:'apartment',status:'active',title:'Anunț fictiv',city:'Localitate Demo',county:'Județ Demo',street:'Strada Demo',street_number:'1',latitude:44.432345,longitude:26.103456,rooms:2,sale_price:90000,for_sale:true};
    for(const precise of [true,false]){const value=mapPartnerListing({...row,location_precise:precise},[],'https://example.invalid');assertSchema(value,spec.components.schemas.Listing);expect(Object.keys(value).sort()).toEqual(Object.keys(spec.components.schemas.Listing.properties).sort());if(!precise){expect(value.location.street).toBeNull();expect(value.location.street_number).toBeNull();}}
    assertSchema(withdrawnTombstone(listing),spec.components.schemas.Listing);
  });
  it('matches agency, agent, taxonomies, identity and error serialization',async()=>{
    const agent=mapPartnerAgent({id:sandboxAgents[0].id,organization_id:listing.agency_id,full_name:'Agent Demo',email:'demo@example.invalid',phone:null,avatar_url:null,job_title:null},'https://example.invalid');assertSchema(agent,spec.components.schemas.Agent);
    const agency=mapPartnerAgency({id:listing.agency_id,name:'Agenția Demo',legal_name:null,cui:null,email:null,phone:null,material_website:null,logo_path:null,logo_url:null,registered_address:null,city:null,county:null},null,'https://example.invalid');assertSchema(agency,spec.components.schemas.Agency);assertSchema(TAXONOMIES,spec.components.schemas.Taxonomies);
    assertSchema(await meResponse(ctx,1).json(),spec.components.schemas.Me);assertSchema(await apiError(422,'VALIDATION_ERROR','Date fictive',ctx.requestId,[{field:'email'}]).json(),spec.components.schemas.Error);
  });
  it('examples parse through each real POST validator and expose exact enums and limits',()=>{
    for(const [path,validator]of [['/listings/{id}/publication',publicationSchema],['/leads',leadSchema],['/leads/{id}/messages',messageSchema],['/stats',statsSchema]] as const)expect(validator.safeParse(spec.paths[path].post.requestBody.content['application/json'].example).success,path).toBe(true);
    expect(spec.components.schemas.Publication.properties.status.enum).toEqual(['published','pending_review','rejected','removed']);expect(spec.components.schemas.Stats.properties.items.maxItems).toBe(500);expect(spec.components.schemas.Message.properties.sender.const).toBe('client');expect(spec.components.schemas.Lead.properties.name.maxLength).toBe(200);
  });
  it('matches real read envelopes including changes cursor semantics',async()=>{
    const store:any={scope:async()=>({known:[listing.agency_id],active:new Map([[listing.agency_id,null]])}),organizations:async()=>[],agents:async()=>[],listings:async()=>[],maxSeq:async()=>12,events:async()=>[{seq:13,type:'listing.upserted',entity_type:'listing',entity_id:listing.id,organization_id:listing.agency_id,occurred_at:'2026-11-07T12:00:00Z'}]};
    for(const [path,response]of [['/agencies',await handleAgencies(ctx,store)],['/agents',await handleAgents(ctx,store,new URL('https://example.invalid'))],['/listings',await handleListings(ctx,store,new URL('https://example.invalid'))],['/changes',await handleChanges(ctx,store,new URL('https://example.invalid?cursor=eyJzIjoxMn0'))]] as const)assertSchema(await response.json(),spec.paths[path].get.responses['200'].content['application/json'].schema);
    const initial=await (await handleChanges(ctx,store,new URL('https://example.invalid'))).json();expect(initial.data).toEqual([]);expect(initial.has_more).toBe(false);
  });
  it('matches actual write response serialization for live and test, new and deduplicated',async()=>{
    for(const test of [true,false])for(const deduplicated of [true,false]){
      const store:any={read:{scope:async()=>({active:new Map([[listing.agency_id,null]])})},lead:async()=>({id:listing.id,deduplicated,test}),publication:async()=>({id:listing.id,applied:true,...(test?{test:true,deduplicated:false}:{})}),message:async()=>({id:listing.id,deduplicated,...(test?{test:true,applied:true}:{})}),stats:async()=>({accepted:1})};
      for(const [path,kind]of [['/leads','lead'],['/listings/{id}/publication','publication'],['/leads/{id}/messages','message'],['/stats','stats']] as const){const operation=spec.paths[path].post;const response=await handlePartnerWrite(ctx,store,kind,operation.requestBody.content['application/json'].example,listing.id);assertSchema(await response.json(),operation.responses[String(response.status)].content['application/json'].schema);}
    }
  });
  it('webhook schemas match the real config and event serializers',()=>{
    const value=publicWebhook({url:'https://example.invalid/hook',events:[],status:'active',has_secret:true,last_success_at:null,consecutive_failures:0,secret_encrypted:'fixture',generation:'fixture'});
    assertSchema(value,spec.components.schemas.Webhook);
    assertSchema(webhookEvent({seq:1,type:'listing.upserted',entity_type:'listing',entity_id:listing.id,organization_id:listing.agency_id,occurred_at:'2026-11-07T12:00:00Z'}),spec.components.schemas.WebhookEvent);
    expect(webhookInput.safeParse(spec.paths['/webhook'].put.requestBody.content['application/json'].example).success).toBe(true);
    assertSchema({id:listing.id,event:'webhook.test',seq:1,http_status:204,duration_ms:10,attempt:1,occurred_at:'2026-11-07T12:00:00Z',error:null},spec.components.schemas.Delivery);
  });
  it('rejects real-looking keys, private URLs and nonfictitious credential examples',()=>{
    const text=[raw,read('src/components/marketing/PartnerDeveloperDocs.tsx'),read('src/lib/partner-developer-docs.ts')].join('\n');
    expect(text).not.toMatch(/hbpk_(test|live)_[A-Za-z0-9]{40,128}/);expect(text).not.toMatch(/sb_(secret|publishable)_|eyJ[a-zA-Z0-9_-]{20,}\./);expect(text).not.toMatch(/https?:\/\/(localhost|127\.|10\.|192\.168\.)|supabase\.co/);
    for(const operation of partnerOperations){const curl=partnerCurl(operation.path,operation.method,operation.operation);expect(curl).toContain('$HABITOO_API_KEY');expect(curl).not.toMatch(/hbpk_(test|live)_[a-f0-9]{64}/);}
  });
  it('keeps the feed contract unchanged by documentation releases and both bundled references in sync',()=>{const feed=JSON.parse(read('public/dezvoltatori/openapi.json'));delete feed.info;delete feed['x-developer-guide'];expect(createHash('sha256').update(JSON.stringify(feed)).digest('hex')).toBe('7b1038b35f1a77a51a7ca7db5dc85fe33915a6a7f46ff4903eb3bb006c079779');expect(read('src/lib/documentation-assets/feed.openapi.json')).toBe(read('public/dezvoltatori/openapi.json'));expect(read('src/lib/documentation-assets/partner.openapi.json')).toBe(raw);});
  it('lists every nested listing field without silently resolving feed schemas',()=>{const rows=partnerRows(partnerSpec.components.schemas.Listing);expect(rows.some(r=>r.name==='location.street')).toBe(true);expect(rows.some(r=>r.name==='offers[].currency')).toBe(true);expect(rows.filter(r=>!r.name.includes('.')).map(r=>r.name).sort()).toEqual(Object.keys(listing).sort());});
});