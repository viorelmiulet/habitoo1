import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),cfg:vi.fn(()=>({defaultFrom:'offers@example.com'}))}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const b={middleware:()=>b,inputValidator:()=>b,handler:(h:unknown)=>h};return b;}}));
vi.mock('./org-access',()=>({requireActiveOrgAuth:{}}));
vi.mock('./mailgun.server',()=>({sendEmail:mocks.send,getMailgunConfig:mocks.cfg}));
import {sendCollaboratorOffer,previewCollaboratorOfferSend} from './neutral-offer.functions';
import {neutralOfferUrl} from './neutral-offer';
const code='a'.repeat(48),userId='11111111-1111-4111-8111-111111111111';
const property={id:'22222222-2222-4222-8222-222222222222',organization_id:'org',status:'active',deleted_at:null,title:'Apartament'};
const input=(channel='email')=>({propertyId:property.id,code,channel,recipient:channel==='email'?'client@example.com':'0722123456',recipientName:'Colaborator',message:neutralOfferUrl(code),sendKey:'33333333-3333-4333-8333-333333333333',confirmed:true});
function fake(status='active',revoked=false){let delivery:any=null;const writes=vi.fn(),rpc=vi.fn(async(name:string)=>({data:name==='collaborator_offer_recipients'?[]:'activity',error:null}));
const db={rpc,from:(table:string)=>{let result:any=table==='properties'?{...property,status}:table==='profiles'?{organization_id:'org',full_name:'Ana',email:'ana@example.com'}:table==='neutral_offer_links'?revoked?null:{id:'link',code}:delivery;const b:any={select:()=>b,eq:()=>b,is:()=>b,maybeSingle:async()=>({data:result,error:null}),insert:async(v:any)=>{writes(table,v);delivery=v;return {error:null};},update:(v:any)=>{writes(table,v);if(delivery)Object.assign(delivery,v);result=delivery;return b;},then:(r:any)=>Promise.resolve({data:result,error:null}).then(r)};return b;}};return {db,writes,rpc};}
const run=sendCollaboratorOffer as unknown as (v:any)=>Promise<any>,preview=previewCollaboratorOfferSend as unknown as (v:any)=>Promise<any>;
beforeEach(()=>{vi.clearAllMocks();mocks.send.mockResolvedValue({ok:true});});
describe('collaborator send boundary',()=>{
it('previews WhatsApp without writes or sending',async()=>{const f=fake();const result=await preview({data:input('whatsapp'),context:{supabase:f.db,userId}});expect(result.url).toContain('https://wa.me/40722123456?text=');expect(f.writes).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();});
it('blocks inactive properties and revoked links before sending',async()=>{for(const f of [fake('sold'),fake('active',true)]){await expect(run({data:input(),context:{supabase:f.db,userId}})).rejects.toThrow();expect(f.writes).not.toHaveBeenCalled();}expect(mocks.send).not.toHaveBeenCalled();});
it('requires confirmation for external messaging',async()=>{const f=fake();await expect(run({data:{...input('sms'),confirmed:false},context:{supabase:f.db,userId}})).rejects.toThrow('Confirmă');expect(f.writes).not.toHaveBeenCalled();});
it('uses the existing email service and logs once, without real mail',async()=>{const f=fake();const ctx={supabase:f.db,userId};await run({data:input(),context:ctx});await run({data:input(),context:ctx});expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({from:'Ana <offers@example.com>',text:neutralOfferUrl(code)}));expect(f.rpc).toHaveBeenCalledWith('finish_collaborator_offer_delivery',{_id:input().sendKey});});
it('email failure never creates an activity',async()=>{mocks.send.mockResolvedValue({ok:false});const f=fake();await expect(run({data:input(),context:{supabase:f.db,userId}})).rejects.toThrow('Emailul nu a fost trimis');expect(f.rpc).not.toHaveBeenCalled();});
it('rejects a recipient outside participating partner agencies',async()=>{const f=fake();await expect(run({data:{...input(),recipientAgentId:userId},context:{supabase:f.db,userId}})).rejects.toThrow('Colaboratorul');expect(mocks.send).not.toHaveBeenCalled();});
});