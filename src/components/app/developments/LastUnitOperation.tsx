import {useEffect,useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import type {UnitOperationResult} from '@/lib/developments/unit-operations';

export function LastUnitOperation({developmentId,onFinished}:{developmentId:string;onFinished:()=>void}) {
 const {data:job}=useQuery({queryKey:['development-unit-operation',developmentId],queryFn:async()=>{
  const {data,error}=await supabase.from('development_clone_jobs').select('id,operation,status,total,processed,result,last_error').eq('development_id',developmentId).neq('operation','clone').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;return data;
 },refetchInterval:q=>q.state.data&&['queued','running'].includes(q.state.data.status)?3000:false});
 const last=useRef('');
 useEffect(()=>{const key=job?`${job.id}:${job.processed}:${job.status}`:'';if(key&&last.current!==key){last.current=key;onFinished();}},[job,onFinished]);
 if(!job)return null;
 const result=job.result as unknown as UnitOperationResult;
 const running=['queued','running'].includes(job.status);
 return <section className="space-y-2 border-y py-4"><h3 className="font-medium">Ultima operație</h3>
  <p className="text-sm">{job.operation==='withdraw'?'Retragere':job.operation==='republish'?'Republicare':'Scoatere din ansamblu'} · {running?`În curs: ${job.processed} din ${job.total}`:`${result.succeeded?.length??0} unități procesate, ${(result.failed?.length??0)+(job.status==='error'?job.total-job.processed:0)} eșuate.`}</p>
  {job.last_error?<p className="text-sm text-destructive">{job.last_error}</p>:null}
  {result.failed?.map((item,i)=><p key={`${item.propertyId}:${i}`} className="text-sm text-destructive">{item.reference??item.propertyId}: {item.reason}</p>)}
 </section>;
}