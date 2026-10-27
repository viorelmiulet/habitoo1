import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { PortalRepublishButton } from './PortalRepublishDialog';
const mock = vi.hoisted(() => ({ start: vi.fn(), success: vi.fn(), batch: {status:'running',total:2,succeeded:0,failed:0,skipped:0,pending:2,errors:[] as any[],skippedItems:[] as any[]} }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@/hooks/use-session', () => ({ useCurrentUser: () => ({ data:{userId:'agent',organization:{id:'org'}} }) }));
vi.mock('@/lib/portals/republish.functions', () => ({
  startRepublish: mock.start,
  getRepublishBatch: async () => ({...mock.batch}),
  getRepublishPreview: async () => ({canChooseScope:false,activeBatchId:null,listings:2,portals:1,perPortal:[{portalId:'lacheie',name:'La Cheie',queued:2,autoPull:0}]}),
}));
vi.mock('@/components/ui/sonner', () => ({toast:{success:mock.success}}));
const pause = async () => act(async()=>{await new Promise(r=>setTimeout(r,100));});
const click = async (text:string) => act(async()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);if(!b)throw Error(text);b.click();});
it('closes after start, displays progress, reopens errors and restores a completed report after remount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true); localStorage.clear();
  mock.start.mockResolvedValue({batchId:'11111111-1111-4111-8111-111111111111'});
  const host=document.createElement('div');document.body.append(host);
  let root=createRoot(host);const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  const draw=async(reportBatchId?:string)=>act(async()=>root.render(<QueryClientProvider client={client}><PortalRepublishButton reportBatchId={reportBatchId}/></QueryClientProvider>));
  await draw();await pause();await click('Republică anunțurile');await pause();await click('Republică');await pause();
  expect(document.querySelector('[role="dialog"]')).toBeNull();expect(mock.success).toHaveBeenCalledWith('Republicarea a pornit în fundal');
  expect(document.body.textContent).toContain('Republicare 0/2');
  mock.batch={...mock.batch,succeeded:1,pending:1};await act(async()=>{await client.invalidateQueries({queryKey:['portal-republish-batch']});});await pause();
  expect(document.body.textContent).toContain('Republicare 1/2');await click('Republicare 1/2');await pause();expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  mock.batch={...mock.batch,status:'done',failed:1,pending:0,errors:[{listing:'HB-2',portal:'La Cheie',message:'Eroare simulată'}],skippedItems:[{listing:'HB-3',portal:'Properstar',message:'Preluare automată'}]};
  await act(async()=>{await client.invalidateQueries({queryKey:['portal-republish-batch']});});await pause();
  expect(mock.success).toHaveBeenCalledWith('Republicare terminată: 1 reușite, 1 erori');expect(document.body.textContent).toContain('HB-2');expect(document.body.textContent).toContain('HB-3');
  await act(async()=>root.unmount());client.clear();root=createRoot(host);
  await draw('11111111-1111-4111-8111-111111111111');await pause();expect(document.querySelector('[role="dialog"]')).not.toBeNull();expect(document.body.textContent).toContain('Eroare simulată');
  expect(mock.start).toHaveBeenCalledTimes(1);
  await act(async()=>root.unmount());client.clear();host.remove();vi.unstubAllGlobals();
});