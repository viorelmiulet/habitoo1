import {it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@tanstack/react-router',()=>({Link:({to,params,children,...rest}:{to:string;params:{id:string};children:React.ReactNode})=><a href={to.replace('$id',params.id)} {...rest}>{children}</a>}));
import {DevelopmentBadge} from './DevelopmentBadge';
import {applyPropertyFilterClauses} from '@/lib/property-filter-query';
import {emptyPropertyListFilters} from '@/lib/property-list-filters';
it('eticheta „Ansamblu: {nume}” trimite la ansamblu',()=>{
 const html=renderToStaticMarkup(<DevelopmentBadge id="dev-1" name="Parcul Verde"/>);
 expect(html).toContain('Ansamblu: Parcul Verde');expect(html).toContain('href="/app/developments/dev-1"');
});
function rec(){const calls:unknown[][]=[];const q:any={};for(const m of ['eq','in','gte','lte','is','or'])q[m]=(...a:unknown[])=>{calls.push([m,...a]);return q;};return {q,calls};}
it('filtrul Ansamblu: toate, doar din ansambluri, un ansamblu anume',()=>{
 const ctx={agentClause:{kind:'none'} as const};
 let r=rec();applyPropertyFilterClauses(r.q,{...emptyPropertyListFilters,development:'all'},ctx);expect(r.calls.some(c=>String(c[1]).includes('development_id'))).toBe(false);
 r=rec();applyPropertyFilterClauses(r.q,{...emptyPropertyListFilters,development:'any'},ctx);expect(r.calls).toContainEqual(['or','development_id.not.is.null']);
 r=rec();applyPropertyFilterClauses(r.q,{...emptyPropertyListFilters,development:'dev-1'},ctx);expect(r.calls).toContainEqual(['eq','development_id','dev-1']);
});
