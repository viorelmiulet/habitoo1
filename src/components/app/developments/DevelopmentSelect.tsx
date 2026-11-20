import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { developmentsOptions } from '@/lib/developments';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export function DevelopmentSelect({orgId,value,onChange}:{orgId?:string;value:string|null|undefined;onChange?:(id:string|null)=>void}) {
 const {data:items=[]}=useQuery({...developmentsOptions(orgId),enabled:Boolean(orgId)});
 const selected=items.find(d=>d.id===value);
 return <div className="space-y-2"><Label htmlFor="property-development">Ansamblu</Label>{onChange ? <Select value={value||'none'} onValueChange={v=>onChange(v==='none'?null:v)}><SelectTrigger id="property-development"><SelectValue placeholder="Fără ansamblu"/></SelectTrigger><SelectContent><SelectItem value="none">Fără ansamblu</SelectItem>{items.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select> : !value ? <p className="text-sm text-muted-foreground">Fără ansamblu</p> : null}{value ? <Link className="block text-sm text-primary underline" to="/app/developments/$id" params={{id:value}}>{selected?.name||'Vezi ansamblul'} →</Link>:null}</div>;
}
