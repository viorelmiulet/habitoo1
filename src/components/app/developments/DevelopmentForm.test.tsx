// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {DevelopmentForm} from './DevelopmentForm';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
vi.stubGlobal('ResizeObserver',class { observe(){} unobserve(){} disconnect(){} });
const mocks=vi.hoisted(()=>({saved:vi.fn(),navigation:vi.fn(),fetch:vi.fn()}));
vi.mock('@tanstack/react-router',()=>({useNavigate:()=>mocks.navigation,Link:({children,to,...props}:any)=><a href={to} {...props}>{children}</a>}));
vi.mock('@/hooks/use-session',()=>({useCurrentUser:()=>({data:{userId:'agent-A',isAdmin:true,isSuperadmin:false,organization:{id:'agency-A'}}})}));
vi.mock('@/components/app/LocationPicker',()=>({emptyLocation:{countyName:'',countySirutaCode:null,uatSirutaCode:null,localitySirutaCode:null,localityName:''},LocationPicker:()=>null}));
vi.mock('@/components/app/PropertyLocationMap',()=>({PropertyLocationMap:()=>null}));
vi.mock('@/components/app/ai/TextCorrectionControl',()=>({TextCorrectionControl:()=>null}));
vi.mock('./DevelopmentGallery',()=>({DevelopmentGallery:()=>null}));
vi.mock('./DevelopmentUnits',()=>({DevelopmentUnits:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,then:(resolve:any)=>resolve({data:[],error:null}),insert:(payload:any)=>{mocks.saved(payload);return {select:()=>({single:async()=>({data:{id:'development-A'},error:null})})};}};return q;}}}));
let root:ReturnType<typeof createRoot>|undefined;let container:HTMLDivElement|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());container?.remove();});
it('formularul salvează datele agenției și deschide ansamblul creat fără nicio publicare',async()=>{
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
 const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 await act(async()=>root?.render(<QueryClientProvider client={qc}><DevelopmentForm/></QueryClientProvider>));
 const input=container.querySelector<HTMLInputElement>('#development-name');expect(input).not.toBeNull();
 await act(async()=>{if(input){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,'Ansamblu Test');input.dispatchEvent(new Event('input',{bubbles:true}));}});
 await act(async()=>{container?.querySelector('form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));});
 expect(mocks.saved).toHaveBeenCalledWith(expect.objectContaining({name:'Ansamblu Test',organization_id:'agency-A',assigned_to:'agent-A',status:'draft',amenities:[]}));
 expect(mocks.navigation).toHaveBeenCalledWith({to:'/app/developments/$id',params:{id:'development-A'}});
});
