// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionData, HomeAction } from '@/lib/daily-brief/actions';
const mocks=vi.hoisted(()=>({load:vi.fn(),save:vi.fn()}));
vi.mock('@/lib/daily-brief/daily-brief.functions',()=>({getDailyBrief:mocks.load,setHomeActionPreference:mocks.save}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock('@tanstack/react-router',async()=>{const React=await import('react');return {Link:({to,children}: {to:string;children:React.ReactNode})=>React.createElement('a',{href:to},children)};});
import { DailyBriefCard } from './DailyBriefCard';
(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>|null=null;
const rows:HomeAction[]=Array.from({length:7},(_,i)=>({id:`lead:${i}`,entityKey:`lead:${i}`,kind:'new_lead',title:`Lead ${i}`,reason:'Storia, primit acum 3 h, necontactat',to:'/app/leads',button:'Deschide lead',at:'2026-11-23',agentId:'agent',source:'Storia',propertyTitle:null,ageHours:3}));
const data=(actions=rows):ActionData=>({version:2,actions,computedAt:'2026-11-23',agents:[],isAdmin:false});
async function render(){
 const host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 await act(async()=>{root?.render(<QueryClientProvider client={client}><DailyBriefCard userId="agent" organizationId="org"/></QueryClientProvider>);});
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});
 return host;
}
async function click(host:HTMLElement,text:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(text));if(!button)throw new Error(`Button not found: ${text}`);await act(async()=>{button.click();await new Promise(resolve=>setTimeout(resolve,30));});}
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';vi.clearAllMocks();});
describe('Home actions controls',()=>{
 it('shows five actions and expands the existing complete list without refetching',async()=>{
  mocks.load.mockResolvedValue({data:data(),sentence:null});const host=await render();
  expect(host.querySelectorAll('li')).toHaveLength(5);
  await click(host,'Vezi toate');expect(host.querySelectorAll('li')).toHaveLength(7);
  expect(mocks.load).toHaveBeenCalledTimes(1);
 });
 it.each(['snooze','ignore'] as const)('saves %s for the current user and reads the refreshed list back',async(mode)=>{
  mocks.load.mockResolvedValue({data:data(),sentence:null});mocks.save.mockImplementation(async()=>{mocks.load.mockResolvedValue({data:data(rows.slice(1)),sentence:null});return {ok:true};});
  const host=await render();await click(host,mode==='snooze'?'Amână 1 zi':'Ignoră');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith({data:{actionId:'lead:0',mode}});
  expect(host.querySelector('li')?.textContent).toContain('Lead 1');
  expect(mocks.load).toHaveBeenLastCalledWith({data:{refresh:true}});
 });
 it('refresh reads changed facts without a new initial-generation request',async()=>{
  mocks.load.mockResolvedValue({data:data(),sentence:null});const host=await render();
  mocks.load.mockResolvedValue({data:data([]),sentence:null});await click(host,'Actualizează');
  expect(mocks.load).toHaveBeenLastCalledWith({data:{refresh:true}});
  expect(host.querySelectorAll('li')).toHaveLength(0);
 });
});