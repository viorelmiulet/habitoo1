import {useQuery,useMutation} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {getStoriaAuthorizationStatus,startStoriaAuthorization,revokeStoriaAuthorization} from '@/lib/portals/storia.functions';
import {toast} from '@/components/ui/sonner';
import {StatusBadge} from '@/components/app/StatusBadge';
export function StoriaAccountControls({organizationId,layout}:{organizationId:string;layout?:'rows'}){
 const status=useServerFn(getStoriaAuthorizationStatus),start=useServerFn(startStoriaAuthorization),revoke=useServerFn(revokeStoriaAuthorization);
 return <div className="w-full space-y-3">{(['agency','developer'] as const).map(account=><Account key={account} layout={layout} account={account} organizationId={organizationId} status={status} start={start} revoke={revoke}/>)}</div>;
}
function Account({account,organizationId,status,start,revoke,layout}:{layout?:'rows';account:'agency'|'developer';organizationId:string;status:ReturnType<typeof useServerFn<typeof getStoriaAuthorizationStatus>>;start:ReturnType<typeof useServerFn<typeof startStoriaAuthorization>>;revoke:ReturnType<typeof useServerFn<typeof revokeStoriaAuthorization>>}){
 const query=useQuery({queryKey:['storia-account',organizationId,account],queryFn:()=>status({data:{organizationId,account}})});
 const action=useMutation({mutationFn:async(disconnect:boolean)=>{if(disconnect){await revoke({data:{organizationId,account}});await query.refetch();}else{const {url}=await start({data:{organizationId,account}});window.location.assign(url);}},onError:e=>toast.error(e.message)});
 const label=account==='agency'?'Cont agenție':'Cont dezvoltator (ansambluri)';
 if(layout==='rows'){const connected=query.data?.connected===true;return <div data-storia-subrow={account} className="grid min-h-11 grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><span className="text-sm font-medium">{label}</span><div className="flex flex-wrap items-center gap-2 sm:justify-end"><StatusBadge className="h-7 text-[13px]" tone={query.isError?'danger':connected?'success':'neutral'} dot>{query.isError?'Stare indisponibilă':connected?'Conectat':'Deconectat'}</StatusBadge><Button variant="outline" className="h-11 min-w-44" disabled={action.isPending||!query.data?.appConfigured} onClick={()=>action.mutate(false)}>{connected?'Reconectează':'Conectează'}</Button>{connected?<Button variant="outline" className="h-11" disabled={action.isPending} onClick={()=>action.mutate(true)}>Deconectează</Button>:null}</div></div>;}
 return <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3"><span className="mr-auto font-medium">{account==='agency'?'Cont agenție':'Cont dezvoltator (ansambluri)'}</span><span className="text-sm text-muted-foreground">{query.isError?'Stare indisponibilă':query.data?.connected?'Conectat':'Deconectat'}</span><Button variant="outline" disabled={action.isPending||!query.data?.appConfigured} onClick={()=>action.mutate(false)}>{query.data?.connected?'Reconectează':'Conectează'}</Button>{query.data?.connected?<Button variant="outline" disabled={action.isPending} onClick={()=>action.mutate(true)}>Deconectează</Button>:null}</div>;
}
