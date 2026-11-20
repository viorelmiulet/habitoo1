import {useQuery,useMutation} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {getStoriaAuthorizationStatus,startStoriaAuthorization,revokeStoriaAuthorization} from '@/lib/portals/storia.functions';
import {toast} from '@/components/ui/sonner';
export function StoriaAccountControls({organizationId}:{organizationId:string}){
 const status=useServerFn(getStoriaAuthorizationStatus),start=useServerFn(startStoriaAuthorization),revoke=useServerFn(revokeStoriaAuthorization);
 return <div className="w-full space-y-3">{(['agency','developer'] as const).map(account=><Account key={account} account={account} organizationId={organizationId} status={status} start={start} revoke={revoke}/>)}</div>;
}
function Account({account,organizationId,status,start,revoke}:{account:'agency'|'developer';organizationId:string;status:ReturnType<typeof useServerFn<typeof getStoriaAuthorizationStatus>>;start:ReturnType<typeof useServerFn<typeof startStoriaAuthorization>>;revoke:ReturnType<typeof useServerFn<typeof revokeStoriaAuthorization>>}){
 const query=useQuery({queryKey:['storia-account',organizationId,account],queryFn:()=>status({data:{organizationId,account}})});
 const action=useMutation({mutationFn:async(disconnect:boolean)=>{if(disconnect){await revoke({data:{organizationId,account}});await query.refetch();}else{const {url}=await start({data:{organizationId,account}});window.location.assign(url);}},onError:e=>toast.error(e.message)});
 return <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3"><span className="mr-auto font-medium">{account==='agency'?'Cont agenție':'Cont dezvoltator (ansambluri)'}</span><span className="text-sm text-muted-foreground">{query.isError?'Stare indisponibilă':query.data?.connected?'Conectat':'Deconectat'}</span><Button variant="outline" disabled={action.isPending||!query.data?.appConfigured} onClick={()=>action.mutate(false)}>{query.data?.connected?'Reconectează':'Conectează'}</Button>{query.data?.connected?<Button variant="outline" disabled={action.isPending} onClick={()=>action.mutate(true)}>Deconectează</Button>:null}</div>;
}
