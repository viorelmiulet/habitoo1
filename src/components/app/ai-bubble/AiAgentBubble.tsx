import { useState } from 'react';
import { useLocation,useNavigate } from '@tanstack/react-router';
import { ListChecks,Sparkles,CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LISTING_CHECK_EVENT } from '@/components/app/listing-check-event';
const PROPERTY_PAGE=/^\/app\/properties\/[0-9a-f-]{36}\/?$/i;
export function AiAgentBubble(){
 const {pathname}=useLocation();const navigate=useNavigate();const [menu,setMenu]=useState(false);
 if(pathname==='/app/ai'||pathname.startsWith('/app/ai/'))return null;
 const onProperty=PROPERTY_PAGE.test(pathname);
 return <>
 {menu?<div role="menu" className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] z-40 w-64 rounded-lg border border-border bg-popover p-1 text-sm shadow-lg md:right-4 md:bottom-32 lg:bottom-[4.25rem]">
 <Button role="menuitem" variant="ghost" className="w-full justify-start" onClick={()=>{setMenu(false);navigate({to:'/app',hash:'home-actions'});}}><CalendarCheck className="size-4 text-ai"/>Ce am de făcut azi?</Button>
 {onProperty?<Button role="menuitem" variant="ghost" className="w-full justify-start" onClick={()=>{setMenu(false);window.dispatchEvent(new CustomEvent(LISTING_CHECK_EVENT));}}><ListChecks className="size-4 text-ai"/>Verifică anunțul ăsta</Button>:null}
 <Button role="menuitem" variant="ghost" className="w-full justify-start" onClick={()=>{setMenu(false);navigate({to:'/app/ai'});}}><Sparkles className="size-4 text-ai"/>Deschide Agentul AI</Button></div>:null}
 <Button variant="ghost" data-testid="ai-agent-bubble" aria-label="Deschide Agentul AI" aria-expanded={menu} onClick={()=>setMenu(!menu)} className="ai-agent-bubble fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex size-14 items-center justify-center gap-2 rounded-full border text-sm font-medium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2 focus-visible:ring-offset-background md:right-4 md:bottom-20 md:size-auto md:h-11 md:px-4 lg:bottom-5"><Sparkles aria-hidden className="size-5 text-ai md:size-4"/><span className="hidden md:inline">Agentul AI</span><span aria-hidden className="ai-agent-bubble-dot hidden size-2 rounded-full bg-ai md:inline-block"/></Button>
 </>;
}
